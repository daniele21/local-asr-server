from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from local_asr_server.transcriber import transcribe_file_sync


class ASRWorkerRunner(Protocol):
    """Stable runtime boundary for ASR execution."""

    def transcribe(self, **kwargs: Any) -> dict[str, Any]:
        ...


@dataclass
class InProcessASRWorkerRunner:
    """Runs MLX Whisper in the API process while preserving a worker boundary."""

    transcribe_func: Any = transcribe_file_sync

    def transcribe(self, **kwargs: Any) -> dict[str, Any]:
        return self.transcribe_func(**kwargs)
