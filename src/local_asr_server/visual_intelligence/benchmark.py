from __future__ import annotations

import json
import resource
import time
from pathlib import Path
from typing import Any

from local_asr_server.visual_intelligence.adapter import (
    detect_active_tile,
    match_participant_name,
)
from local_asr_server.visual_intelligence.contracts import VisualRoutingConfig
from local_asr_server.visual_intelligence.router import TaskAwareFrameRouter
from local_asr_server.visual_intelligence.signatures import calculate_signature


def load_visual_dataset(dataset_dir: Path) -> dict[str, Any]:
    ground_truth_path = dataset_dir / "ground_truth.json"
    payload = json.loads(ground_truth_path.read_text(encoding="utf-8"))
    frames = []
    for item in payload.get("frames") or []:
        frame_path = dataset_dir / str(item["file"])
        if not frame_path.is_file():
            raise FileNotFoundError(frame_path)
        frames.append({**item, "path": frame_path})
    return {**payload, "frames": frames}


def _ratio(numerator: int, denominator: int, *, empty: float = 0.0) -> float:
    return round(numerator / denominator, 4) if denominator else empty


def evaluate_speakers(
    expected: list[str | None],
    predicted: list[str | None],
) -> dict[str, Any]:
    true_positive = false_positive = false_negative = correct_abstention = 0
    for wanted, actual in zip(expected, predicted):
        if wanted is None and actual is None:
            correct_abstention += 1
        elif wanted is None and actual is not None:
            false_positive += 1
        elif wanted == actual:
            true_positive += 1
        else:
            false_negative += 1
            if actual is not None:
                false_positive += 1
    expected_positive = sum(item is not None for item in expected)
    expected_abstentions = len(expected) - expected_positive
    return {
        "precision": _ratio(true_positive, true_positive + false_positive),
        "recall": _ratio(true_positive, true_positive + false_negative),
        "false_attribution_rate": _ratio(false_positive, expected_positive),
        "correct_abstention_rate": _ratio(
            correct_abstention, expected_abstentions, empty=1.0,
        ),
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "correct_abstention": correct_abstention,
    }


def replay_visual_dataset(dataset_dir: Path) -> dict[str, Any]:
    started = time.perf_counter()
    dataset = load_visual_dataset(dataset_dir)
    frames = dataset["frames"]
    participants = [str(item) for item in dataset.get("participants") or []]
    config = VisualRoutingConfig(mode="v2")
    signatures = [
        calculate_signature(
            Path(frame["path"]),
            participant_rows=config.participant_grid_rows,
            participant_columns=config.participant_grid_columns,
        )
        for frame in frames
    ]

    predicted_speakers: list[str | None] = [None]
    ocr_attempts = ocr_bypasses = 0
    for index, frame in enumerate(frames[1:], start=1):
        tile_index = detect_active_tile(
            signatures[index - 1],
            signatures[index],
            color_threshold=config.speaker_tile_color_distance,
        )
        predicted = None
        if tile_index is not None:
            ocr_attempts += 1
            texts = [str(item) for item in frame.get("mock_ocr_text") or []]
            predicted = match_participant_name(texts, participants)
            if predicted:
                ocr_bypasses += 1
        predicted_speakers.append(predicted)

    expected_speakers = [
        (frame.get("expected") or {}).get("active_speaker") for frame in frames
    ]
    candidates, routing_summary = TaskAwareFrameRouter(config).route(
        frames, dataset.get("segments") or [],
    )
    qwen_calls = max(0, len(candidates) - ocr_bypasses)

    expected_states = [
        (
            (frame.get("expected") or {}).get("layout"),
            bool((frame.get("expected") or {}).get("screen_share")),
        )
        for frame in frames
    ]
    observed_states = [
        (
            (frame.get("mock_observation") or {}).get("layout"),
            bool((frame.get("mock_observation") or {}).get("screen_share")),
        )
        for frame in frames
    ]
    state_matches = sum(left == right for left, right in zip(expected_states, observed_states))
    expected_keyframes = {
        int(frame["sequence"]) for frame in frames
        if (frame.get("expected") or {}).get("shared_content_keyframe")
    }
    observed_keyframes = {
        int(frame["sequence"]) for frame in frames
        if (frame.get("mock_observation") or {}).get("shared_content_keyframe")
    }
    keyframe_true_positive = len(expected_keyframes & observed_keyframes)
    elapsed = time.perf_counter() - started
    peak_rss = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)

    return {
        "schema_version": 1,
        "dataset": str(dataset_dir),
        "speaker": evaluate_speakers(expected_speakers, predicted_speakers),
        "meeting_state": {
            "transition_accuracy": _ratio(state_matches, len(expected_states), empty=1.0),
            "debounce_violations": int(dataset.get("mock_debounce_violations") or 0),
        },
        "shared_content": {
            "keyframe_precision": _ratio(
                keyframe_true_positive, len(observed_keyframes), empty=1.0,
            ),
            "keyframe_recall": _ratio(
                keyframe_true_positive, len(expected_keyframes), empty=1.0,
            ),
            "roi_stability": float(dataset.get("mock_roi_stability") or 1.0),
        },
        "efficiency": {
            "candidate_count": len(candidates),
            "qwen_call_count": qwen_calls,
            "qwen_call_ratio": _ratio(qwen_calls, len(candidates)),
            "ocr_attempt_count": ocr_attempts,
            "ocr_bypass_count": ocr_bypasses,
            "ocr_bypass_success_rate": _ratio(ocr_bypasses, ocr_attempts),
            "peak_rss": peak_rss,
            "execution_seconds": round(elapsed, 4),
        },
        "routing": {
            key: value for key, value in routing_summary.items() if key != "candidates"
        },
        "predictions": [
            {
                "sequence": int(frame["sequence"]),
                "expected_speaker": expected,
                "predicted_speaker": predicted,
            }
            for frame, expected, predicted in zip(
                frames, expected_speakers, predicted_speakers,
            )
        ],
    }
