from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from local_asr_server.paths import get_native_capture_helper_path


VALID_NATIVE_MODES = {"both", "mic_only", "pc_only"}


@dataclass
class CaptureSession:
    recording_id: str
    mode: str
    process: subprocess.Popen[str]
    started_at: float = field(default_factory=time.time)
    events: "queue.Queue[dict[str, Any]]" = field(default_factory=queue.Queue)
    stopped: bool = False


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
            session = CaptureSession(recording_id=recording_id, mode=mode, process=process)
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
        with self._lock:
            self._sessions.pop(recording_id, None)
        return {
            "recording_id": recording_id,
            "backend": "native",
            "status": "cancelled" if cancel else "stopped",
            "events": events,
        }
