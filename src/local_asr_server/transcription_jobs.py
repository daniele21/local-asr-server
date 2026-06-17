from __future__ import annotations

import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable


TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled"}


@dataclass
class TranscriptionJob:
    id: str
    recording_id: str
    status: str = "queued"
    current_step: str = "queued"
    progress: int = 0
    error: str | None = None
    result: dict[str, Any] | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    cancel_requested: bool = False
    events: "queue.Queue[dict[str, Any]]" = field(default_factory=queue.Queue)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "recording_id": self.recording_id,
            "status": self.status,
            "current_step": self.current_step,
            "progress": self.progress,
            "error": self.error,
            "result": self.result,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class TranscriptionJobManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, TranscriptionJob] = {}

    def create(self, recording_id: str, runner: Callable[[TranscriptionJob], dict[str, Any]]) -> dict[str, Any]:
        job = TranscriptionJob(id=str(uuid.uuid4()), recording_id=recording_id)
        with self._lock:
            self._jobs[job.id] = job
        self._emit(job, "queued", 0)
        threading.Thread(target=self._run, args=(job, runner), daemon=True).start()
        return job.public()

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
        return job.public() if job else None

    def cancel(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            return None
        job.cancel_requested = True
        if job.status not in TERMINAL_JOB_STATUSES:
            self._emit(job, "cancelled", job.progress)
        return job.public()

    def drain_events(self, job_id: str) -> list[dict[str, Any]] | None:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            return None
        events = []
        while True:
            try:
                events.append(job.events.get_nowait())
            except queue.Empty:
                return events

    def _run(self, job: TranscriptionJob, runner: Callable[[TranscriptionJob], dict[str, Any]]) -> None:
        try:
            if job.cancel_requested:
                self._emit(job, "cancelled", job.progress)
                return
            result = runner(job)
            if job.cancel_requested:
                self._emit(job, "cancelled", job.progress)
                return
            job.result = result
            self._emit(job, "completed", 100)
        except Exception as exc:
            job.error = str(exc)[:2000]
            self._emit(job, "failed", job.progress)

    def _emit(self, job: TranscriptionJob, status: str, progress: int, step: str | None = None) -> None:
        job.status = status
        job.current_step = step or status
        job.progress = progress
        job.updated_at = time.time()
        job.events.put(job.public())
