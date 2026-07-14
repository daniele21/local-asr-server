from __future__ import annotations

import json
import logging
from pathlib import Path
import subprocess
from typing import Any, Callable

from local_asr_server.settings import load_settings
from local_asr_server.paths import get_models_dir
from local_asr_server.speaker_diarization_helper.compile import get_helper_binary
from local_asr_server.diagnostics import diagnostic


logger = logging.getLogger("uvicorn.error")
DIARIZATION_ENGINE = "fluidaudio-community-1"


class LocalSpeakerDiarizationService:
    """Add local FluidAudio speaker clusters to ASR segments post-meeting."""

    def __init__(self, runner: Callable[[dict[str, Path]], dict[str, Any]] | None = None) -> None:
        self._runner = runner or self._run_helper

    def process(
        self,
        store: Any,
        recording_id: str,
        track_paths: list[tuple[dict[str, Any], Path]],
        track_results: list[dict[str, Any]],
    ) -> dict[str, Any]:
        settings = load_settings()
        if not settings.get("speaker_diarization_enabled", False):
            return {
                "status": "disabled",
                "engine": DIARIZATION_ENGINE,
                **diagnostic("speaker_diarization", "disabled", requested_backend=DIARIZATION_ENGINE),
            }
        inputs = {str(track["id"]): path for track, path in track_paths}
        model_path = get_models_dir() / "fluidaudio-speaker-diarization"
        try:
            result = self._runner(inputs)
            tracks = result.get("tracks") or {}
            minimum_overlap = float(settings.get("speaker_diarization_minimum_overlap", 0.25))
            assigned = 0
            for item in track_results:
                track_id = str(item["track"]["id"])
                diarized = (tracks.get(track_id) or {}).get("segments") or []
                assigned += self._assign_segments(item["result"], track_id, diarized, minimum_overlap)
            summary = {
                "status": "completed",
                "engine": result.get("engine") or DIARIZATION_ENGINE,
                "assigned_segments": assigned,
                "model_path": str(model_path),
                "tracks": tracks,
                **diagnostic(
                    "speaker_diarization",
                    "completed",
                    requested_backend=DIARIZATION_ENGINE,
                    actual_backend=result.get("engine") or DIARIZATION_ENGINE,
                    counts={"assigned_segments": assigned, "tracks": len(tracks)},
                    details={"model_path": str(model_path)},
                ),
            }
            store.save_speaker_diarization(recording_id, summary)
            return summary
        except Exception as exc:
            logger.warning("[Speaker diarization] Recording %s skipped: %s", recording_id, exc)
            summary = {
                "status": "failed",
                "engine": DIARIZATION_ENGINE,
                **diagnostic(
                    "speaker_diarization",
                    "failed",
                    requested_backend=DIARIZATION_ENGINE,
                    error=str(exc),
                    details={"model_path": str(model_path)},
                ),
            }
            store.save_speaker_diarization(recording_id, summary)
            return summary

    @staticmethod
    def _assign_segments(
        result: dict[str, Any],
        track_id: str,
        diarized: list[dict[str, Any]],
        minimum_overlap: float,
    ) -> int:
        assigned = 0
        for segment in result.get("segments", []) or []:
            if segment.get("provider_speaker"):
                continue
            start = float(segment.get("start") or 0.0)
            end = float(segment.get("end") or start)
            duration = max(0.001, end - start)
            best: tuple[float, str] | None = None
            for candidate in diarized:
                overlap = max(0.0, min(end, float(candidate["end"])) - max(start, float(candidate["start"])))
                if best is None or overlap > best[0]:
                    best = (overlap, str(candidate["speaker"]))
            if best and best[0] / duration >= minimum_overlap:
                segment["provider_speaker"] = f"{track_id}:{best[1]}"
                assigned += 1
        result.setdefault("metadata", {})["speaker_diarization"] = {
            "engine": DIARIZATION_ENGINE,
            "assigned_segments": assigned,
        }
        return assigned

    @staticmethod
    def _run_helper(inputs: dict[str, Path]) -> dict[str, Any]:
        models_dir = get_models_dir() / "fluidaudio-speaker-diarization"
        models_dir.mkdir(parents=True, exist_ok=True)
        command = [get_helper_binary(), "process", "--models-dir", str(models_dir)]
        for track_id, path in inputs.items():
            command.extend(["--input", f"{track_id}={path}"])
        completed = subprocess.run(command, capture_output=True, text=True, timeout=1800)
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or "FluidAudio helper failed")
        return json.loads(completed.stdout)
