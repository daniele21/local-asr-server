#!/usr/bin/env python3
"""Run the real visual + diarization post-meeting pipeline without Whisper.

The caller must start a compatible local-llm-server first. The smoke test uses
real FluidAudio and Qwen inference, while a deterministic ASR fixture supplies
the two timed text segments needed to validate speaker-cluster fusion.
"""

from __future__ import annotations

import argparse
import json
import tempfile
import time
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI

from local_asr_server.app_services import AppServices, install_compatibility_aliases
from local_asr_server.catalog import CatalogStore
from local_asr_server.jobs import JobStore
from local_asr_server.recordings import RecordingStore
from local_asr_server.schemas import TranscribeRecordingRequest
from local_asr_server.services.transcription_service import TranscriptionService
from local_asr_server.settings import DEFAULT_SETTINGS
from local_asr_server.transcription_jobs import TranscriptionJobManager
from local_asr_server.transcriptions import TranscriptionStore


class ExternalVisionRuntime:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def ensure_llm_ready(self, **_: object) -> dict[str, str]:
        return {"base_url": self.base_url}


def fixture_asr(**_: object) -> dict[str, object]:
    return {
        "text": "Alice apre la riunione. Daniel risponde alla proposta.",
        "segments": [
            {"id": 0, "start": 0.0, "end": 6.8, "text": "Alice apre la riunione."},
            {"id": 1, "start": 8.4, "end": 15.9, "text": "Daniel risponde alla proposta."},
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True, help="Two-speaker WAV fixture")
    parser.add_argument("--frame", type=Path, required=True, help="JPEG with one visible active speaker")
    parser.add_argument("--base-url", default="http://127.0.0.1:1245")
    parser.add_argument("--model", default="qwen3-vl-4b")
    parser.add_argument("--routing-mode", choices=("v1", "shadow", "v2"), default="v1")
    parser.add_argument("--expect", choices=("mapping", "abstention"), default="mapping")
    parser.add_argument("--output-dir", type=Path, help="Keep artifacts here instead of a temporary directory")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audio = args.audio.expanduser().resolve()
    frame = args.frame.expanduser().resolve()
    if not audio.is_file() or not frame.is_file():
        raise SystemExit("Audio and frame fixtures must exist")
    if not frame.read_bytes().startswith(b"\xff\xd8\xff"):
        raise SystemExit("The visual fixture must be a JPEG")

    temporary = None
    if args.output_dir:
        root = args.output_dir.expanduser().resolve()
        root.mkdir(parents=True, exist_ok=True)
    else:
        temporary = tempfile.TemporaryDirectory(prefix="closedroom-combo-e2e-")
        root = Path(temporary.name)

    recordings_dir = root / "recordings"
    transcriptions_dir = root / "transcriptions"
    database = root / "closedroom.db"
    settings = {
        **DEFAULT_SETTINGS,
        "recordings_dir": str(recordings_dir),
        "transcriptions_dir": str(transcriptions_dir),
        "speaker_diarization_enabled": True,
        "speaker_diarization_minimum_overlap": 0.25,
        "visual_intelligence_enabled": True,
        "visual_llm_model": args.model,
        "visual_routing_mode": args.routing_mode,
        "visual_minimum_observations": 3,
        "visual_minimum_margin": 0.2,
    }

    with ExitStack() as stack:
        for target in (
            "local_asr_server.services.transcription_service.load_settings",
            "local_asr_server.speaker_diarization.load_settings",
            "local_asr_server.visual_intelligence.service.load_settings",
            "local_asr_server.transcriptions.load_settings",
        ):
            stack.enter_context(patch(target, return_value=settings))

        catalog = CatalogStore(database)
        recordings = RecordingStore(recordings_dir, use_settings_dir=False, catalog=catalog)
        transcriptions = TranscriptionStore(catalog=catalog)
        jobs = JobStore(database)
        transcription_jobs = TranscriptionJobManager(jobs)
        service = TranscriptionService()
        app = FastAPI()
        app.state.default_model = "fixture-asr"
        services = AppServices(
            capture=None,  # type: ignore[arg-type]
            runtime=ExternalVisionRuntime(args.base_url),  # type: ignore[arg-type]
            transcription=service,
            catalog=catalog,
            jobs=jobs,
            transcription_jobs=transcription_jobs,
            analysis_jobs=None,  # type: ignore[arg-type]
            recordings=recordings,
            transcriptions=transcriptions,
        )
        install_compatibility_aliases(app, services)

        recording = recordings.create(
            title="Visual diarization E2E fixture",
            project_name="E2E",
            mime_type="audio/wav",
            model="fixture-asr",
            language="it",
            capture_mode="pc_only",
            capture_backend="fixture",
        )
        recording_id = recording["id"]
        recordings.append_track_chunk(recording_id, "system", 0, audio.read_bytes())
        frame_bytes = frame.read_bytes()
        for sequence, timestamp in enumerate((1.0, 3.0, 5.0)):
            recordings.stage_visual_frame(recording_id, sequence, timestamp, frame_bytes)
        recordings.finalize(recording_id)

        body = TranscribeRecordingRequest(model="fixture-asr", language="it")
        created_job = transcription_jobs.create(
            recording_id,
            lambda job: service.transcribe_recording(
                app, recording_id, body, job, engine=fixture_asr,
            ),
        )
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            completed_job = transcription_jobs.get(created_job["id"])
            if completed_job and completed_job["status"] in {"completed", "failed", "cancelled"}:
                break
            time.sleep(0.1)
        else:
            raise TimeoutError("Transcription job did not complete")
        if completed_job["status"] != "completed":
            raise RuntimeError(f"Transcription job failed: {completed_job.get('error')}")
        payload = completed_job["result"]
        job_events = transcription_jobs.events_after(created_job["id"], 0) or []

    session_dir = recordings.session_dir(recording_id)
    required = [
        "metadata.json",
        "speaker-diarization.json",
        "visual_observations.jsonl",
        "visual_summary.json",
        "intelligence.json",
    ]
    if args.routing_mode in {"shadow", "v2"}:
        required.append("visual_routing.json")
    if args.routing_mode == "v2":
        required.append("visual_intelligence.json")
    missing = [name for name in required if not (session_dir / name).is_file()]
    mappings = payload.get("speaker_attribution", {}).get("mappings", [])
    accepted = [item for item in mappings if item.get("status") == "accepted"]
    attribution_ok = bool(accepted) if args.expect == "mapping" else not accepted
    staging_removed = not (session_dir / ".visual-staging").exists()
    transcript_files = sorted(transcriptions_dir.glob("transcript_*.json"))
    with catalog.connection() as connection:
        recording_rows = connection.execute("SELECT COUNT(*) FROM recordings").fetchone()[0]
        transcription_rows = connection.execute("SELECT COUNT(*) FROM transcriptions").fetchone()[0]
        job_rows = connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        job_event_rows = connection.execute("SELECT COUNT(*) FROM job_events").fetchone()[0]

    observed_steps = [event["current_step"] for event in job_events]
    required_steps = {
        "queued", "validating_audio", "transcribing_system", "diarizing",
        "merging", "visual_processing", "audio_intelligence", "saving", "completed",
    }
    missing_steps = sorted(required_steps.difference(observed_steps))

    result = {
        "status": "passed" if not missing and attribution_ok and staging_removed and transcript_files and not missing_steps else "failed",
        "root": str(root),
        "recording_id": recording_id,
        "diarization": payload.get("speaker_diarization"),
        "speaker_attribution": payload.get("speaker_attribution"),
        "expected_attribution": args.expect,
        "routing_mode": args.routing_mode,
        "segments": payload.get("segments"),
        "missing_artifacts": missing,
        "staging_removed": staging_removed,
        "transcript_files": [str(path) for path in transcript_files],
        "job": {"id": created_job["id"], "status": completed_job["status"]},
        "job_steps": observed_steps,
        "missing_job_steps": missing_steps,
        "catalog_rows": {
            "recordings": recording_rows,
            "transcriptions": transcription_rows,
            "jobs": job_rows,
            "job_events": job_event_rows,
        },
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if temporary and result["status"] == "passed":
        temporary.cleanup()
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
