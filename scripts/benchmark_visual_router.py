#!/usr/bin/env python3
"""Measure task-aware routing on an existing visual staging manifest.

This script never calls ASR or Qwen and does not mutate the recording.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from local_asr_server.visual_intelligence.contracts import VisualRoutingConfig
from local_asr_server.visual_intelligence.router import TaskAwareFrameRouter, legacy_candidate_sequences


def load_frames(manifest: Path) -> list[dict]:
    frames = []
    for line in manifest.read_text(encoding="utf-8").splitlines():
        item = json.loads(line)
        path = manifest.parent / str(item["file"])
        if path.is_file():
            frames.append({**item, "path": path})
    return sorted(frames, key=lambda item: int(item["sequence"]))


def subsample(frames: list[dict], fps: float) -> list[dict]:
    selected = []
    next_timestamp = float("-inf")
    interval = 1.0 / fps
    for frame in frames:
        timestamp = float(frame["timestamp"])
        if timestamp >= next_timestamp:
            selected.append(frame)
            next_timestamp = timestamp + interval
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--segments", type=Path)
    parser.add_argument("--fps", type=float, nargs="+", default=[0.5, 1.0, 2.0])
    parser.add_argument("--include-candidates", action="store_true")
    args = parser.parse_args()
    frames = load_frames(args.manifest)
    segments = json.loads(args.segments.read_text(encoding="utf-8")) if args.segments else []
    if isinstance(segments, dict):
        segments = segments.get("segments") or []
    results = []
    for fps in args.fps:
        sampled = subsample(frames, fps)
        started = time.perf_counter()
        candidates, summary = TaskAwareFrameRouter(VisualRoutingConfig(mode="shadow")).route(sampled, segments)
        legacy_sequences = legacy_candidate_sequences(sampled)
        elapsed = time.perf_counter() - started
        public_summary = summary if args.include_candidates else {
            key: value for key, value in summary.items() if key != "candidates"
        }
        results.append({
            "fps": fps,
            "available_frames": len(sampled),
            "available_bytes": sum(Path(item["path"]).stat().st_size for item in sampled),
            "routing_seconds": round(elapsed, 4),
            "estimated_qwen_calls": len(candidates),
            "legacy_v1_qwen_calls": len(legacy_sequences),
            "task_aware_to_legacy_call_ratio": round(len(candidates) / len(legacy_sequences), 4) if legacy_sequences else None,
            **public_summary,
        })
    print(json.dumps({"schema_version": 1, "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
