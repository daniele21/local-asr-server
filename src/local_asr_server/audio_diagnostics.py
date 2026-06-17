from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


SYNC_OK_MS = 200
SYNC_WARNING_MS = 500
SYNC_UNRELIABLE_MS = 2000


def _find_ffprobe() -> str | None:
    return shutil.which("ffprobe")


def probe_audio(path: Path) -> dict[str, Any]:
    ffprobe = _find_ffprobe()
    result: dict[str, Any] = {
        "path": path.name,
        "exists": path.exists(),
        "valid": False,
        "duration_seconds": None,
        "size_bytes": path.stat().st_size if path.exists() else 0,
        "error": None,
    }
    if not path.exists():
        result["error"] = "file_missing"
        return result
    if ffprobe is None:
        result["error"] = "ffprobe_missing"
        return result
    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if completed.returncode != 0:
            result["error"] = (completed.stderr or "ffprobe_failed").strip()[:500]
            return result
        payload = json.loads(completed.stdout or "{}")
        duration = payload.get("format", {}).get("duration")
        result["duration_seconds"] = float(duration) if duration is not None else None
        result["valid"] = result["duration_seconds"] is not None
        return result
    except Exception as exc:  # pragma: no cover - defensive subprocess boundary
        result["error"] = str(exc)[:500]
        return result


def build_quality_report(tracks: list[tuple[dict[str, Any], Path]]) -> dict[str, Any]:
    track_reports: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    durations_ms: dict[str, int] = {}
    for track, path in tracks:
        report = probe_audio(path)
        track_id = track["id"]
        track_reports[track_id] = report
        duration = report.get("duration_seconds")
        if duration is not None:
            durations_ms[track_id] = int(float(duration) * 1000)
        if report.get("size_bytes", 0) == 0:
            warnings.append(f"track_{track_id}_empty")

    sync: dict[str, Any] = {"status": "unknown", "duration_delta_ms": None}
    if "mic" in durations_ms and "system" in durations_ms:
        delta = abs(durations_ms["mic"] - durations_ms["system"])
        sync["duration_delta_ms"] = delta
        if delta < SYNC_OK_MS:
            sync["status"] = "ok"
        elif delta < SYNC_WARNING_MS:
            sync["status"] = "warning"
            warnings.append("sync_duration_warning")
        elif delta < SYNC_UNRELIABLE_MS:
            sync["status"] = "serious_warning"
            warnings.append("sync_duration_serious_warning")
        else:
            sync["status"] = "unreliable"
            warnings.append("sync_duration_unreliable")

    return {
        "tracks": track_reports,
        "sync": sync,
        "warnings": warnings,
    }
