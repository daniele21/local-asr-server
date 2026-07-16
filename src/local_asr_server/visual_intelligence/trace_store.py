from __future__ import annotations

import json
import time
from pathlib import Path
from threading import Lock
from typing import Any


class VisualTraceStore:
    """Thread-safe append-only logger for visual intelligence runs."""

    def __init__(self, trace_file: Path, recording_id: str, generation_id: str) -> None:
        self.trace_file = trace_file
        self.recording_id = recording_id
        self.generation_id = generation_id
        self._lock = Lock()
        self._started_at = time.perf_counter()

    def log_event(self, event_name: str, **kwargs: Any) -> None:
        """Log a diagnostic event to trace.jsonl."""
        elapsed = time.perf_counter() - self._started_at
        event_data = {
            "event": event_name,
            "generation_id": self.generation_id,
            "recording_id": self.recording_id,
            "elapsed_seconds": round(elapsed, 4),
            "timestamp": round(time.time(), 3),
            **kwargs,
        }
        with self._lock:
            try:
                self.trace_file.parent.mkdir(parents=True, exist_ok=True)
                with open(self.trace_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps(event_data, ensure_ascii=False) + "\n")
                    f.flush()
            except Exception as e:
                # Fallback to standard logging or ignore to prevent breaking execution
                import logging
                logger = logging.getLogger("uvicorn.error")
                logger.warning("Failed to log visual trace event %s: %s", event_name, e)
