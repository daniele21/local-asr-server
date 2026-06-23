"""Deterministic post-ASR quality controls for Whisper transcription results."""

from __future__ import annotations

import re
from collections import defaultdict
from difflib import SequenceMatcher
from typing import Any


COMMON_GHOSTS = frozenset({"grazie", "grazie a tutti", "ok", "buongiorno", "ciao"})
GHOST_BOUNDARY_SECONDS = 30.0
GHOST_BOUNDARY_TOLERANCE_SECONDS = 0.75
HIGH_NO_SPEECH_PROBABILITY = 0.55
LOW_LOGPROB = -0.7
HIGH_COMPRESSION_RATIO = 2.4
NEAR_SILENT_RMS = 0.0005
NEAR_SILENT_PEAK = 0.002


def normalize_text(text: str) -> str:
    text = re.sub(r"[^\wàèéìòù]+", " ", text.lower().strip())
    return re.sub(r"\s+", " ", text).strip()


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def audio_stats(samples: Any, *, sample_rate: int = 16000) -> dict[str, float]:
    """Return normalized signal diagnostics used before multi-track ASR."""
    import numpy as np

    values = np.nan_to_num(np.asarray(samples, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    if values.size == 0:
        return {"rms": 0.0, "peak": 0.0, "duration_seconds": 0.0}
    return {
        "rms": float(np.sqrt(np.mean(np.square(values)))),
        "peak": float(np.max(np.abs(values))),
        "duration_seconds": float(values.size / sample_rate),
    }


def is_near_silent_track(stats: dict[str, float]) -> bool:
    return stats["rms"] < NEAR_SILENT_RMS and stats["peak"] < NEAR_SILENT_PEAK


def _near_window_boundary(start: float) -> bool:
    offset = start % GHOST_BOUNDARY_SECONDS
    return min(offset, GHOST_BOUNDARY_SECONDS - offset) <= GHOST_BOUNDARY_TOLERANCE_SECONDS


def clean_segments(segments: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Drop deterministic low-confidence and repeated Whisper ghost segments.

    The input is never mutated: callers can persist the unmodified raw result.
    """
    cleaned: list[dict[str, Any]] = []
    dropped: list[dict[str, Any]] = []
    recent_short_counts: defaultdict[tuple[Any, int, str], int] = defaultdict(int)

    for original in sorted(segments, key=lambda seg: (_as_float(seg.get("start")), _as_float(seg.get("end")))):
        segment = dict(original)
        text = (segment.get("text") or "").strip()
        normalized = normalize_text(text)
        if not normalized:
            continue
        start = _as_float(segment.get("start"))
        end = _as_float(segment.get("end"), start)
        if normalized in COMMON_GHOSTS and _near_window_boundary(start):
            segment["dropped_reason"] = "window_boundary_ghost"
        elif (
            segment.get("no_speech_prob") is not None
            and segment.get("avg_logprob") is not None
            and _as_float(segment["no_speech_prob"]) > HIGH_NO_SPEECH_PROBABILITY
            and _as_float(segment["avg_logprob"]) < LOW_LOGPROB
        ):
            segment["dropped_reason"] = "high_no_speech_low_logprob"
        elif segment.get("compression_ratio") is not None and _as_float(segment["compression_ratio"]) > HIGH_COMPRESSION_RATIO:
            segment["dropped_reason"] = "high_compression_ratio"
        else:
            key = (segment.get("track_id"), int(start // 60), normalized)
            if len(normalized.split()) <= 2:
                recent_short_counts[key] += 1
                if recent_short_counts[key] > 2:
                    segment["dropped_reason"] = "repeated_short_phrase"
        if segment.get("dropped_reason"):
            dropped.append(segment)
        else:
            cleaned.append(segment)
    return cleaned, dropped


def _overlap_seconds(start: float, end: float, window: dict[str, Any]) -> float:
    return max(0.0, min(end, _as_float(window.get("end"))) - max(start, _as_float(window.get("start"))))


def filter_segments_by_vad(
    segments: list[dict[str, Any]], vad_windows: list[dict[str, Any]], *, min_overlap_ratio: float = 0.20, min_overlap_seconds: float = 0.15
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Keep Whisper segments supported by detected speech, retaining diagnostics."""
    kept: list[dict[str, Any]] = []
    dropped: list[dict[str, Any]] = []
    for original in segments:
        segment = dict(original)
        start = _as_float(segment.get("start"))
        end = _as_float(segment.get("end"), start)
        duration = max(0.001, end - start)
        overlap = sum(_overlap_seconds(start, end, window) for window in vad_windows)
        ratio = min(1.0, overlap / duration)
        segment["vad_overlap_ratio"] = round(ratio, 3)
        segment["vad_overlap_seconds"] = round(overlap, 3)
        if ratio >= min_overlap_ratio or overlap >= min_overlap_seconds:
            kept.append(segment)
        else:
            segment["dropped_reason"] = "no_vad_overlap"
            dropped.append(segment)
    return kept, dropped


def _segment_overlap_ratio(a: dict[str, Any], b: dict[str, Any]) -> float:
    a_start, a_end = _as_float(a.get("start")), _as_float(a.get("end"), _as_float(a.get("start")))
    b_start, b_end = _as_float(b.get("start")), _as_float(b.get("end"), _as_float(b.get("start")))
    intersection = max(0.0, min(a_end, b_end) - max(a_start, b_start))
    return intersection / max(0.001, min(a_end - a_start, b_end - b_start))


def _segment_quality(segment: dict[str, Any]) -> float:
    score = _as_float(segment.get("avg_logprob")) - _as_float(segment.get("no_speech_prob"))
    if _as_float(segment.get("compression_ratio")) > HIGH_COMPRESSION_RATIO:
        score -= 1.0
    if normalize_text(segment.get("text") or "") in COMMON_GHOSTS:
        score -= 0.5
    return score + _as_float(segment.get("vad_overlap_ratio"))


def dedupe_cross_track_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove same utterance captured by both microphone and system tracks."""
    kept: list[dict[str, Any]] = []
    for segment in sorted(segments, key=lambda seg: (_as_float(seg.get("start")), _as_float(seg.get("end")))):
        duplicate_index = next((
            index for index, existing in enumerate(kept)
            if existing.get("track_id") != segment.get("track_id")
            and _segment_overlap_ratio(existing, segment) >= 0.60
            and SequenceMatcher(None, normalize_text(existing.get("text") or ""), normalize_text(segment.get("text") or "")).ratio() >= 0.85
        ), None)
        if duplicate_index is None:
            kept.append(segment)
        elif _segment_quality(segment) > _segment_quality(kept[duplicate_index]):
            kept[duplicate_index] = segment
    return kept
