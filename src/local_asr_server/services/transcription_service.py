from __future__ import annotations

from typing import Any

from local_asr_server.runtime.asr_worker import ASRWorkerRunner, InProcessASRWorkerRunner


class TranscriptionService:
    """Application service boundary for transcription workflows."""

    def __init__(self, runner: ASRWorkerRunner | None = None) -> None:
        self.runner = runner or InProcessASRWorkerRunner()

    def transcribe_file(self, **kwargs: Any) -> dict[str, Any]:
        return self.runner.transcribe(**kwargs)
