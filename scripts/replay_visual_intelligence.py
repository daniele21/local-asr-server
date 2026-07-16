#!/usr/bin/env python3
"""Replay the deterministic visual-meeting fixture and print quality metrics."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from local_asr_server.visual_intelligence.benchmark import replay_visual_dataset


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "dataset",
        nargs="?",
        type=Path,
        default=PROJECT_ROOT / "datasets" / "visual-meetings",
    )
    args = parser.parse_args()
    print(json.dumps(replay_visual_dataset(args.dataset), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
