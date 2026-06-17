from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from local_asr_server.paths import (
    get_native_capture_helper_path,
    get_ffmpeg_path,
    get_ffprobe_path,
)


VALID_NATIVE_MODES = {"both", "mic_only", "pc_only"}


@dataclass
class CaptureSession:
    recording_id: str
    mode: str
    process: subprocess.Popen[str]
    output_dir: Path
    started_at: float = field(default_factory=time.time)
    events: "queue.Queue[dict[str, Any]]" = field(default_factory=queue.Queue)
    stopped: bool = False


def validate_audio_file(file_path: Path) -> dict[str, Any]:
    """Validate audio file using ffprobe and return info/warnings."""
    if not file_path.exists():
        return {"valid": False, "error": "file_not_found"}
    if file_path.stat().st_size == 0:
        return {"valid": False, "error": "file_empty"}
        
    try:
        ffprobe_path = get_ffprobe_path()
        
        cmd = [
            ffprobe_path,
            "-v", "error",
            "-show_entries", "format=duration:stream=sample_rate,channels",
            "-of", "json",
            str(file_path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10, check=True)
        data = json.loads(res.stdout or "{}")
        
        streams = data.get("streams", [])
        fmt = data.get("format", {})
        
        duration = float(fmt.get("duration", 0.0))
        channels = int(streams[0].get("channels", 0)) if streams else 0
        sample_rate = int(streams[0].get("sample_rate", 0)) if streams else 0
        
        if duration <= 0:
            return {"valid": False, "error": "zero_duration", "size": file_path.stat().st_size}
            
        return {
            "valid": True,
            "duration": duration,
            "channels": channels,
            "sample_rate": sample_rate,
            "size": file_path.stat().st_size
        }
    except Exception as e:
        return {"valid": False, "error": "ffprobe_failed", "details": str(e)}


class NativeCaptureManager:
    def __init__(self, helper_path: Path | None = None) -> None:
        self.helper_path = helper_path or get_native_capture_helper_path()
        self._lock = threading.Lock()
        self._sessions: dict[str, CaptureSession] = {}

    def capabilities(self) -> dict[str, Any]:
        if sys.platform != "darwin":
            return {
                "available": False,
                "backend": "native",
                "reason": "macos_required",
                "modes": [],
            }
        if not self.helper_path.exists():
            try:
                from local_asr_server.native_capture_helper import get_helper_binary
                self.helper_path = Path(get_helper_binary())
            except Exception as exc:
                return {
                    "available": False,
                    "backend": "native",
                    "reason": "helper_missing",
                    "helper_path": str(self.helper_path),
                    "error": str(exc),
                    "modes": [],
                }
        return self._run_json(["capabilities"], fallback_reason="capabilities_failed")

    def permissions(self) -> dict[str, Any]:
        if not self.helper_path.exists():
            return {"ok": False, "reason": "helper_missing"}
        return self._run_json(["permissions"], fallback_reason="permissions_failed")

    def request_permissions(self) -> dict[str, Any]:
        if not self.helper_path.exists():
            return {"ok": False, "reason": "helper_missing"}
        return self._run_json(["request-permissions"], fallback_reason="request_permissions_failed")

    def start(self, recording_id: str, output_dir: Path, mode: str) -> dict[str, Any]:
        if mode not in VALID_NATIVE_MODES:
            raise ValueError(f"Invalid native capture mode: {mode}")
        if not self.capabilities().get("available"):
            raise RuntimeError("Native capture helper is not available")
        with self._lock:
            if recording_id in self._sessions:
                raise RuntimeError("Native capture session already active")
            process = subprocess.Popen(
                [
                    str(self.helper_path),
                    "start",
                    "--recording-id",
                    recording_id,
                    "--output-dir",
                    str(output_dir),
                    "--mode",
                    mode,
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            session = CaptureSession(
                recording_id=recording_id,
                mode=mode,
                process=process,
                output_dir=output_dir,
            )
            self._sessions[recording_id] = session
            threading.Thread(target=self._read_events, args=(session,), daemon=True).start()
            return {
                "recording_id": recording_id,
                "capture_session_id": str(uuid.uuid4()),
                "backend": "native",
                "mode": mode,
                "status": "starting",
            }

    def stop(self, recording_id: str) -> dict[str, Any]:
        return self._terminate(recording_id, cancel=False)

    def cancel(self, recording_id: str) -> dict[str, Any]:
        return self._terminate(recording_id, cancel=True)

    def drain_events(self, recording_id: str) -> list[dict[str, Any]]:
        with self._lock:
            session = self._sessions.get(recording_id)
        if session is None:
            return []
        events = []
        while True:
            try:
                events.append(session.events.get_nowait())
            except queue.Empty:
                return events

    def _run_json(self, args: list[str], *, fallback_reason: str) -> dict[str, Any]:
        try:
            completed = subprocess.run(
                [str(self.helper_path), *args],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            if completed.returncode != 0:
                return {"available": False, "backend": "native", "reason": fallback_reason, "error": completed.stderr.strip()}
            return json.loads(completed.stdout or "{}")
        except Exception as exc:
            return {"available": False, "backend": "native", "reason": fallback_reason, "error": str(exc)}

    def _read_events(self, session: CaptureSession) -> None:
        if session.process.stdout is None:
            return
        try:
            for line in session.process.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    event = {"type": "warning", "message": line}
                session.events.put(event)
                if event.get("type") in {"stopped", "error"}:
                    session.stopped = True
            session.process.wait()
        finally:
            session.process.stdout.close()
            session.stopped = True

    def _terminate(self, recording_id: str, *, cancel: bool) -> dict[str, Any]:
        with self._lock:
            session = self._sessions.get(recording_id)
        if session is None:
            return {"recording_id": recording_id, "backend": "native", "status": "not_active"}
        if session.process.poll() is None:
            session.process.terminate()
            try:
                session.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                session.process.kill()
        events = []
        while True:
            try:
                events.append(session.events.get_nowait())
            except queue.Empty:
                break
                
        # Post-process mixing and validation
        if not cancel:
            output_dir = session.output_dir
            mode = session.mode
            mic_path = output_dir / "mic.wav"
            system_path = output_dir / "system.wav"
            recording_path = output_dir / "recording.wav"
            
            # Post-processing mixing
            if mode == "both":
                mic_exists = mic_path.exists() and mic_path.stat().st_size > 0
                system_exists = system_path.exists() and system_path.stat().st_size > 0
                
                if mic_exists and system_exists:
                    try:
                        ffmpeg_path = get_ffmpeg_path()
                        cmd = [
                            ffmpeg_path,
                            "-y",
                            "-i", str(mic_path),
                            "-i", str(system_path),
                            "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0",
                            "-ar", "16000",
                            "-ac", "1",
                            str(recording_path)
                        ]
                        subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
                    except Exception as e:
                        error_msg = f"Failed to mix audio tracks with ffmpeg: {e}"
                        events.append({"type": "error", "source": "backend", "message": error_msg})
                elif mic_exists:
                    try:
                        shutil.copy2(mic_path, recording_path)
                    except Exception as e:
                        events.append({"type": "error", "source": "backend", "message": f"Failed to copy mic.wav to recording.wav: {e}"})
                elif system_exists:
                    try:
                        shutil.copy2(system_path, recording_path)
                    except Exception as e:
                        events.append({"type": "error", "source": "backend", "message": f"Failed to copy system.wav to recording.wav: {e}"})
                else:
                    events.append({"type": "warning", "message": "Neither mic.wav nor system.wav contains valid audio data."})
            
            # Build and save timeline.json
            timeline_data = {
                "recording_ready_at": None,
                "tracks": {}
            }
            
            for event in events:
                if event.get("type") == "ready":
                    timeline_data["recording_ready_at"] = event.get("recording_ready_at")
                elif event.get("type") == "track_ready":
                    src = event.get("source")
                    if src:
                        timeline_data["tracks"][src] = {
                            "first_sample_wall_time": event.get("first_sample_wall_time"),
                            "first_sample_pts": event.get("first_sample_pts")
                        }
            
            # Compute offsets relative to recording_ready_at if possible
            ready_at = timeline_data.get("recording_ready_at")
            if ready_at is not None:
                for src, track_info in list(timeline_data["tracks"].items()):
                    wall_time = track_info.get("first_sample_wall_time")
                    if wall_time is not None:
                        offset_ms = int((wall_time - ready_at) * 1000)
                        timeline_data["tracks"][src]["offset_ms"] = offset_ms
            
            timeline_path = output_dir / "timeline.json"
            try:
                with open(timeline_path, "w", encoding="utf-8") as f:
                    json.dump(timeline_data, f, indent=2)
            except Exception as e:
                events.append({"type": "warning", "message": f"Failed to write timeline.json: {e}"})

            # Run ffprobe validation
            paths_to_validate = {}
            if mode == "both":
                paths_to_validate = {"mic": mic_path, "system": system_path, "mixed": recording_path}
            elif mode == "mic_only":
                paths_to_validate = {"mic": mic_path}
            else:
                paths_to_validate = {"system": system_path}
                
            for source, path in paths_to_validate.items():
                report = validate_audio_file(path)
                if not report["valid"]:
                    events.append({
                        "type": "warning",
                        "message": f"Validation failed for track {source}: {report.get('error')} ({report.get('details', '')})"
                    })
                elif report.get("duration", 0.0) < 1.0:
                    events.append({
                        "type": "warning",
                        "message": f"Track {source} is extremely short (duration: {report['duration']}s)"
                    })

        with self._lock:
            self._sessions.pop(recording_id, None)
            
        return {
            "recording_id": recording_id,
            "backend": "native",
            "status": "cancelled" if cancel else "stopped",
            "events": events,
        }
