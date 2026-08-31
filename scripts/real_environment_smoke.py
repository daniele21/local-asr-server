#!/usr/bin/env python3
"""Automated ClosedRoom target-environment smoke for a real Apple Silicon Mac.

The run drives the packaged WKWebView via macOS Accessibility/System Events,
uses the app's real native capture/TCC path, verifies persisted audio through the
loopback API, and removes only the meeting it created. Missing TCC/Accessibility
permission is BLOCKED_PERMISSION (exit 2), not a product failure.
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import platform
import plistlib
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

PASS, FAIL, BLOCKED = "pass", "fail", "blocked_permission"
LABELS = {
    "new": ("New meeting", "Nuovo meeting"),
    "ready": ("Ready to record", "Pronto per registrare"),
    "start": ("Start Recording", "Avvia Registrazione"),
    "stop": ("Stop and Save", "Termina e salva"),
    "transcribe": ("Transcribe", "Trascrivi"),
    "search": ("Search meeting, project or text", "Cerca meeting, progetto o testo"),
    "permission": ("ClosedRoom needs a permission", "ClosedRoom ha bisogno di un permesso"),
}

UI_SCRIPT = r'''
on run argv
  set targetPID to (item 1 of argv) as integer
  set actionName to item 2 of argv
  set oldDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to "\n"
  set wantedLabels to text items of (item 3 of argv)
  set AppleScript's text item delimiters to oldDelims
  tell application "System Events"
    if UI elements enabled is false then error "accessibility_permission_required"
    set p to first application process whose unix id is targetPID
    set frontmost of p to true
    if (count windows of p) is 0 then error "closedroom_window_missing"
    if actionName is "window" then return (name of window 1 of p) as text
    if actionName is "focused" then
      try
        set e to value of attribute "AXFocusedUIElement" of p
        try
          return (role of e as text) & " | " & (description of e as text)
        on error
          try
            return (role of e as text) & " | " & (name of e as text)
          on error
            return "unknown"
          end try
        end try
      on error
        return "unknown"
      end try
    end if
    set allItems to entire contents of window 1 of p
    repeat with e in allItems
      repeat with wanted in wantedLabels
        set matched to false
        try
          if (name of e as text) is (wanted as text) then set matched to true
        end try
        if not matched then
          try
            if (description of e as text) is (wanted as text) then set matched to true
          end try
        end if
        if not matched then
          try
            if (value of e as text) is (wanted as text) then set matched to true
          end try
        end if
        if matched then
          if actionName is "exists" then return "true"
          if actionName is "press" then
            try
              perform action "AXPress" of e
            on error
              click e
            end try
            return "pressed"
          end if
        end if
      end repeat
    end repeat
  end tell
  if actionName is "exists" then return "false"
  error "ui_element_not_found"
end run
'''

KEY_SCRIPT = r'''
on run argv
  set targetPID to (item 1 of argv) as integer
  set keyName to item 2 of argv
  tell application "System Events"
    if UI elements enabled is false then error "accessibility_permission_required"
    set p to first application process whose unix id is targetPID
    set frontmost of p to true
    tell p
      if keyName is "cmd-k" then
        keystroke "k" using {command down}
      else if keyName is "escape" then
        key code 53
      else if keyName is "cmd-q" then
        keystroke "q" using {command down}
      end if
    end tell
  end tell
end run
'''


def args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ClosedRoom automated macOS real-environment smoke")
    p.add_argument("--root", default=".")
    p.add_argument("--app", help="Existing finalized .app; otherwise latest successful build")
    p.add_argument("--build", action="store_true", help="Build a fresh exact-checkout .app first")
    p.add_argument("--record-seconds", type=float, default=8.0)
    p.add_argument("--timeout", type=float, default=90.0)
    p.add_argument("--keep-meeting", action="store_true")
    p.add_argument("--evidence")
    return p.parse_args()


def wait(predicate: Callable[[], bool], timeout: float, interval: float = 0.4) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if predicate(): return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def run(cmd: list[str], *, cwd: Path | None = None, timeout: float | None = None) -> str:
    r = subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True, timeout=timeout)
    return r.stdout.strip()


def osascript(source: str, *values: str) -> str:
    r = subprocess.run(
        ["osascript", "-l", "AppleScript", "-e", source, "--", *values],
        capture_output=True, text=True, timeout=15,
    )
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout or "AppleScript failed").strip())
    return r.stdout.strip()


def ui(pid: int, action: str, labels: Iterable[str] = ()) -> str:
    try:
        return osascript(UI_SCRIPT, str(pid), action, "\n".join(labels))
    except RuntimeError as exc:
        text = str(exc).lower()
        if "accessibility_permission_required" in text or "assistive access" in text:
            raise PermissionError("terminal_accessibility_permission_required") from exc
        raise


def exists(pid: int, labels: Iterable[str]) -> bool:
    try: return ui(pid, "exists", labels).lower() == "true"
    except RuntimeError: return False


def key(pid: int, name: str) -> None:
    try: osascript(KEY_SCRIPT, str(pid), name)
    except RuntimeError as exc:
        text = str(exc).lower()
        if "accessibility_permission_required" in text or "assistive access" in text:
            raise PermissionError("terminal_accessibility_permission_required") from exc
        raise


def git_state(root: Path) -> tuple[str, bool]:
    try:
        return run(["git", "rev-parse", "--short=12", "HEAD"], cwd=root), bool(run(["git", "status", "--porcelain"], cwd=root))
    except Exception:
        return "unknown", True


def latest_app(root: Path) -> tuple[Path, Path | None]:
    sys.path.insert(0, str(root / "scripts"))
    try:
        from smoke_packaged_app import latest_finalized_app  # type: ignore
        return latest_finalized_app(root)
    finally:
        sys.path.pop(0)


def bundle_info(app: Path) -> dict[str, str]:
    plist = app / "Contents" / "Info.plist"
    with plist.open("rb") as f: info = plistlib.load(f)
    executable = str(info.get("CFBundleExecutable") or "")
    result = {
        "bundle_id": str(info.get("CFBundleIdentifier") or ""),
        "version": str(info.get("CFBundleShortVersionString") or info.get("CFBundleVersion") or ""),
        "display_name": str(info.get("CFBundleDisplayName") or info.get("CFBundleName") or app.stem),
        "executable": str(app / "Contents" / "MacOS" / executable),
    }
    if not result["bundle_id"] or not executable or not Path(result["executable"]).is_file():
        raise RuntimeError("invalid packaged app identity/executable")
    return result


def pids_for(executable: str) -> list[int]:
    output = run(["ps", "-axo", "pid=,command="])
    found = []
    for line in output.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and executable in parts[1]:
            try: found.append(int(parts[0]))
            except ValueError: pass
    return found


def http_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=1.5) as r:
        value = json.loads(r.read())
    return value if isinstance(value, dict) else {}


def ports_for_pid(pid: int) -> list[int]:
    try:
        out = run(["lsof", "-nP", "-a", "-p", str(pid), "-iTCP", "-sTCP:LISTEN"])
    except subprocess.CalledProcessError:
        return []
    found: set[int] = set()
    for line in out.splitlines()[1:]:
        fields = line.split()
        for field in fields:
            if "->" in field or ":" not in field: continue
            tail = field.rsplit(":", 1)[-1]
            if tail.isdigit(): found.add(int(tail))
    return sorted(found)


def discover_server(pid: int, bundle_id: str, version: str, timeout: float) -> tuple[int, dict[str, Any]]:
    answer: tuple[int, dict[str, Any]] | None = None
    def probe() -> bool:
        nonlocal answer
        for port in ports_for_pid(pid):
            try: health = http_json(f"http://127.0.0.1:{port}/health")
            except Exception: continue
            if not health.get("ok"): continue
            if health.get("bundle_identifier") not in (None, bundle_id): continue
            if version and health.get("app_version") not in (None, version): continue
            answer = (port, health); return True
        return False
    if not wait(probe, timeout): raise RuntimeError("packaged app loopback server not found")
    assert answer is not None
    return answer


class Api:
    def __init__(self, port: int):
        self.base = f"http://127.0.0.1:{port}"
        jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        self.json("/v1/session")

    def json(self, path: str, method: str = "GET", body: dict[str, Any] | None = None, timeout: float = 8) -> Any:
        data, headers = None, {}
        if body is not None:
            data = json.dumps(body).encode(); headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        with self.opener.open(req, timeout=timeout) as r: raw = r.read()
        return json.loads(raw) if raw else None

    def health(self) -> dict[str, Any]: return self.json("/health")
    def recordings(self) -> list[dict[str, Any]]:
        value = self.json("/v1/recordings")
        return value.get("items", []) if isinstance(value, dict) else []


def newest(before: set[str], items: list[dict[str, Any]]) -> dict[str, Any] | None:
    new = [x for x in items if str(x.get("id") or "") not in before]
    return max(new, key=lambda x: str(x.get("created_at") or "")) if new else None


def source_tracks_with_data(recording: dict[str, Any]) -> set[str]:
    result = set()
    for track in recording.get("audio_tracks") or []:
        if isinstance(track, dict) and int(track.get("bytes_written") or 0) > 0 and int(track.get("chunk_count") or 0) > 0:
            result.add(str(track.get("source") or ""))
    return result


def permissions_help(p: dict[str, Any] | None = None, accessibility: bool = False) -> list[str]:
    steps = []
    if accessibility:
        steps += [
            "System Settings > Privacy & Security > Accessibility: allow the Terminal app running this command.",
            "If prompted, also allow that Terminal app to automate System Events.",
        ]
    if p:
        if p.get("microphone") != "authorized":
            steps.append("System Settings > Privacy & Security > Microphone: allow ClosedRoom, then quit/reopen it.")
        if p.get("screen_capture") != "granted":
            steps.append("System Settings > Privacy & Security > Screen & System Audio Recording: allow ClosedRoom, then quit/reopen it.")
    steps.append("Re-run the same command after granting the requested permission(s).")
    return steps


def evidence_path(root: Path, explicit: str | None) -> Path:
    if explicit: path = Path(explicit).expanduser().resolve()
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = root / "dist" / "evidence" / "real-environment" / stamp / "report.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def cleanup_old_evidence(root: Path, keep: int = 5) -> None:
    parent = root / "dist" / "evidence" / "real-environment"
    if not parent.is_dir(): return
    for path in sorted((p for p in parent.iterdir() if p.is_dir()), reverse=True)[keep:]:
        shutil.rmtree(path, ignore_errors=True)


def quit_app(pid: int, executable: str, port: int | None) -> dict[str, Any]:
    result = {"cmd_q": False, "sigterm_fallback": False, "process_gone": False, "port_closed": None}
    try: key(pid, "cmd-q"); result["cmd_q"] = True
    except Exception: pass
    result["process_gone"] = wait(lambda: pid not in pids_for(executable), 15)
    if not result["process_gone"]:
        try: os.kill(pid, signal.SIGTERM); result["sigterm_fallback"] = True
        except ProcessLookupError: pass
        result["process_gone"] = wait(lambda: pid not in pids_for(executable), 8)
    if port is not None:
        result["port_closed"] = wait(lambda: port not in ports_for_pid(pid), 5) if not result["process_gone"] else True
    return result


def main() -> int:
    a = args(); root = Path(a.root).resolve(); revision, dirty = git_state(root)
    report: dict[str, Any] = {
        "schema_version": 1, "status": FAIL, "execution_environment": "target-macos-real",
        "fidelity_class": "target_environment", "started_at": datetime.now(timezone.utc).isoformat(),
        "source_revision": revision, "source_dirty": dirty,
        "platform": {"system": platform.system(), "machine": platform.machine(), "macos": platform.mac_ver()[0]},
        "checks": [], "errors": [], "remediation": [], "cleanup": {},
        "residual_gaps": ["VoiceOver spoken-output quality and subjective usability still require human judgement; this run verifies the accessibility tree and keyboard/focus path."],
    }
    output = evidence_path(root, a.evidence)
    pid = port = None; api = None; owned_id = None; executable = ""

    def check(name: str, condition: bool, detail: Any = None) -> None:
        report["checks"].append({"name": name, "status": PASS if condition else FAIL, "detail": detail})
        if not condition: raise RuntimeError(f"check failed: {name}")

    try:
        check("target_platform", platform.system() == "Darwin" and platform.machine() == "arm64", report["platform"])
        if a.build: subprocess.run(["bash", "scripts/build_artifact.sh", "--no-dmg"], cwd=root, check=True)
        if a.app:
            app = Path(a.app).expanduser().resolve(); manifest_path = app.parent / "build-manifest.json"
            if not manifest_path.is_file(): manifest_path = None
        else: app, manifest_path = latest_app(root)
        report["app"] = str(app); report["manifest"] = str(manifest_path) if manifest_path else None
        info = bundle_info(app); report["bundle"] = info; executable = info["executable"]
        manifest = json.loads(manifest_path.read_text()) if manifest_path else {}
        artifact_rev = str(manifest.get("source_revision") or "")
        check("artifact_matches_checkout", revision == "unknown" or not artifact_rev or artifact_rev.startswith(revision) or revision.startswith(artifact_rev), {"checkout": revision, "artifact": artifact_rev})
        check("artifact_not_already_running", not pids_for(executable))

        subprocess.run(["open", "-na", str(app)], check=True)
        found: list[int] = []
        def find_pid() -> bool:
            nonlocal found; found = pids_for(executable); return len(found) == 1
        check("packaged_process_started", wait(find_pid, a.timeout), found)
        pid = found[0]; report["pid"] = pid
        port, health = discover_server(pid, info["bundle_id"], info["version"], a.timeout)
        report["port"] = port; report["health"] = health; api = Api(port)
        check("loopback_health", bool(health.get("ok")), health)

        check("wkwebview_window_accessible", bool(ui(pid, "window")))
        key(pid, "cmd-k"); check("keyboard_cmd_k_search", wait(lambda: exists(pid, LABELS["search"]), 8))
        focused = ui(pid, "focused"); check("search_focus_exposed", focused != "unknown", focused)
        key(pid, "escape"); check("keyboard_escape_search", wait(lambda: not exists(pid, LABELS["search"]), 8))

        caps = api.json("/v1/capture/capabilities"); perms = api.json("/v1/capture/permissions")
        report["capture_capabilities"] = caps; report["capture_permissions"] = perms
        native = caps.get("native", {}) if isinstance(caps, dict) else {}
        check("native_capture_available", caps.get("default_backend") == "native" and bool(native.get("available")), native)
        mode = perms.get("modes", {}).get("both", {}) if isinstance(perms, dict) else {}
        if not mode.get("ok"):
            try: api.json("/v1/capture/ensure-permissions", "POST", {"mode": "both"}, 20)
            except Exception: pass
            time.sleep(2); perms = api.json("/v1/capture/permissions"); report["capture_permissions"] = perms
            mode = perms.get("modes", {}).get("both", {}) if isinstance(perms, dict) else {}
        if not mode.get("ok"):
            report["status"] = BLOCKED; report["remediation"] = permissions_help(perms)
            raise PermissionError("closedroom_capture_permission_required")
        check("tcc_microphone_and_system_audio", True, perms)

        before = api.recordings(); before_ids = {str(x.get("id") or "") for x in before}
        check("new_meeting_visible", wait(lambda: exists(pid, LABELS["new"]), 10))
        ui(pid, "press", LABELS["new"])
        if wait(lambda: exists(pid, LABELS["permission"]), 3):
            report["status"] = BLOCKED; report["remediation"] = permissions_help(perms)
            raise PermissionError("permission_blocker_visible_in_ui")
        check("new_meeting_ready", wait(lambda: exists(pid, LABELS["ready"]), 15))
        ui(pid, "press", LABELS["start"])
        check("runtime_recording", wait(lambda: api.health().get("status") == "recording", 20))
        check("stop_visible", wait(lambda: exists(pid, LABELS["stop"]), 8))
        # Synthetic local system audio; no user content enters the evidence.
        tone = subprocess.Popen(["say", "-v", "Samantha", "ClosedRoom test tone"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(max(2, a.record_seconds)); tone.poll()
        ui(pid, "press", LABELS["stop"])
        check("runtime_stopped", wait(lambda: api.health().get("status") != "recording", 30))

        created = None
        def find_created() -> bool:
            nonlocal created
            created = newest(before_ids, api.recordings())
            return bool(created and created.get("status") not in {"recording", "finalizing"})
        check("recording_persisted", wait(find_created, 30), created)
        assert created is not None
        owned_id = str(created.get("id") or "")
        tracks = source_tracks_with_data(created)
        report["created_recording"] = {
            "id": owned_id, "status": created.get("status"), "capture_backend": created.get("capture_backend"),
            "capture_mode": created.get("capture_mode"), "bytes_written": created.get("bytes_written"),
            "nonempty_track_sources": sorted(tracks), "warnings": created.get("warnings") or [],
        }
        check("native_backend_persisted", created.get("capture_backend") == "native", report["created_recording"])
        check("both_sources_persisted", created.get("capture_mode") == "both" and {"mic", "system"}.issubset(tracks), report["created_recording"])
        check("meeting_workspace_after_stop", wait(lambda: exists(pid, LABELS["transcribe"]), 15))

        if not a.keep_meeting:
            api.json(f"/v1/recordings/{owned_id}/discard", "POST")
            check("run_owned_meeting_removed", wait(lambda: all(str(x.get("id")) != owned_id for x in api.recordings()), 10))
            owned_id = None
        report["status"] = PASS

    except PermissionError as exc:
        if report["status"] != BLOCKED:
            report["status"] = BLOCKED; report["remediation"] = permissions_help(accessibility=True)
        report["errors"].append(str(exc))
    except (Exception,) as exc:
        report["status"] = FAIL; report["errors"].append(str(exc))
    finally:
        if api and owned_id and not a.keep_meeting:
            try: api.json(f"/v1/recordings/{owned_id}/discard", "POST"); report["cleanup"]["meeting_removed_after_failure"] = True
            except Exception as exc: report["cleanup"]["meeting_cleanup_error"] = str(exc)
        if pid and executable:
            report["cleanup"].update(quit_app(pid, executable, port))
            if report["status"] == PASS and not report["cleanup"].get("process_gone"):
                report["status"] = FAIL; report["errors"].append("ClosedRoom process survived cleanup")
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        cleanup_old_evidence(root)

    print(json.dumps(report, indent=2, sort_keys=True)); print(f"Evidence: {output}")
    return 0 if report["status"] == PASS else 2 if report["status"] == BLOCKED else 1


if __name__ == "__main__": raise SystemExit(main())
