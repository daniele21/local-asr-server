from __future__ import annotations

from pathlib import Path
from typing import Any


def relevant_log_lines(log_file: Path | None, recording_id: str, *, limit: int = 50) -> list[str]:
    if log_file is None:
        return []
    candidates = [log_file, *(log_file.parent / f"{log_file.name}.{index}" for index in range(1, 4))]
    matches: list[str] = []
    for candidate in reversed(candidates):
        if not candidate.exists():
            continue
        matches.extend(
            line
            for line in candidate.read_text(encoding="utf-8", errors="replace").splitlines()
            if recording_id in line
        )
    return matches[-limit:]


def build_meeting_diagnostic_report(
    recording_id: str,
    transcription: dict[str, Any] | None,
    job_store: Any,
    *,
    log_file: Path | None = None,
) -> dict[str, Any]:
    """Assemble the canonical report consumed by HTTP, CLI and the React UI."""
    stats = (transcription or {}).get("stats") or {}
    jobs = job_store.list_jobs(
        job_type="transcription", scope_type="recording", scope_id=recording_id, limit=20
    )
    events = [
        event
        for job in jobs
        for event in (job_store.events_after(job["id"], 0) or [])
    ]
    return {
        "recording_id": recording_id,
        "outcome_status": stats.get("outcome_status") or "not_available",
        "diagnostics": stats.get("diagnostics") or [],
        "jobs": jobs,
        "events": events,
        "artifacts": {
            "speaker_diarization": bool(stats.get("speaker_diarization")),
            "visual_intelligence": bool(stats.get("visual_intelligence")),
            "audio_intelligence": bool(stats.get("audio_intelligence")),
        },
        "log_file": str(log_file) if log_file else None,
        "log_lines": relevant_log_lines(log_file, recording_id),
    }
