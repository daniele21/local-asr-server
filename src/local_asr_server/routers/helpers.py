from __future__ import annotations

import os
from typing import Any, TYPE_CHECKING

from local_asr_server.transcription_quality import dedupe_cross_track_segments

if TYPE_CHECKING:
    from fastapi import FastAPI


def _format_time_label(seconds: float) -> str:
    total = max(0, int(seconds))
    minutes = total // 60
    secs = total % 60
    return f"{minutes:02d}:{secs:02d}"


def _merge_track_transcriptions(track_results: list[dict], *, model: str, language: str | None, elapsed: float, recording_id: str) -> dict:
    segments = []
    source_tracks = []
    text_lines = []
    next_id = 0
    languages: list[str] = []

    for item in track_results:
        track = item["track"]
        result = item["result"]
        source_track = {
            "id": track["id"],
            "source": track.get("source"),
            "label": track.get("label"),
            "audio_file": track.get("audio_file"),
        }
        if result.get("metadata"):
            source_track["transcription_metadata"] = result["metadata"]
        if "raw_text" in result:
            source_track["raw_text"] = result["raw_text"]
        if "raw_segments" in result:
            source_track["raw_segments"] = result["raw_segments"]
        source_tracks.append(source_track)
        if result.get("language") and result["language"] not in languages:
            languages.append(result["language"])
        for seg in result.get("segments", []) or []:
            merged_seg = dict(seg)
            merged_seg["id"] = next_id
            next_id += 1
            merged_seg["track_id"] = track["id"]
            merged_seg["source"] = track.get("source")
            merged_seg["speaker_label"] = track.get("label")
            segments.append(merged_seg)

    segments = dedupe_cross_track_segments(segments)
    segments.sort(key=lambda seg: (seg.get("start") or 0.0, seg.get("end") or 0.0, seg.get("track_id") or ""))
    for index, seg in enumerate(segments):
        seg["id"] = index
        label = seg.get("speaker_label") or seg.get("source") or "Audio"
        text = (seg.get("text") or "").strip()
        if text:
            text_lines.append(f"[{_format_time_label(float(seg.get('start') or 0.0))}] {label}: {text}")

    return {
        "text": "\n".join(text_lines),
        "language": ", ".join(languages) if languages else (language or "it"),
        "segments": segments,
        "source_tracks": source_tracks,
        "model": model,
        "backend": "mlx-whisper",
        "recording_id": recording_id,
        "stats": {
            "time_total_seconds": elapsed,
            "track_count": len(track_results),
            "cross_track_deduplication_enabled": True,
        },
    }


def _build_projects(app: FastAPI) -> dict:
    recordings = app.state.recording_store.list(limit=999)
    projects: dict[str, dict] = {}
    unassigned_name = "Senza progetto"
    for recording in recordings:
        project_name = (recording.get("project_name") or "").strip() or unassigned_name
        bucket = projects.setdefault(project_name, {
            "name": project_name,
            "is_unassigned": project_name == unassigned_name,
            "items": [],
        })
        transcription = app.state.transcription_store.find_for_recording(recording["id"])
        bucket["items"].append({
            "recording": recording,
            "transcription": transcription,
            "analysis": transcription.get("analysis") if transcription else None,
        })
    items = sorted(projects.values(), key=lambda item: (item["is_unassigned"], item["name"].lower()))
    return {"items": items}


FALSE_ENV_VALUES = {"0", "false", "no", "off"}


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in FALSE_ENV_VALUES


def _parse_allowed_origins(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _extract_bearer_token(header: str | None) -> str | None:
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token
