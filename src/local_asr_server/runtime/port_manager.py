from __future__ import annotations

import json
import os
import shlex
import signal
import socket
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.request import urlopen

from local_asr_server.app_identity import get_app_identity
from local_asr_server.paths import get_runtime_state_file
from local_asr_server.runtime.models import LOCAL_SERVICE_HOST

RUNTIME_STATE_SCHEMA_VERSION = 1
PROCESS_STOP_TIMEOUT_SECONDS = 4.0
PORT_RELEASE_TIMEOUT_SECONDS = 5.0
_PROCESS_MARKERS = (
    "closedroom",
    "local-asr",
    "local_asr_server",
)
_API_SUBCOMMANDS = {"serve", "app"}


class PortInUseError(RuntimeError):
    """Raised when a requested port belongs to an unrelated process."""


def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex((host, port)) == 0


def query_closedroom_health(host: str, port: int) -> dict[str, Any]:
    try:
        with urlopen(f"http://{host}:{port}/health", timeout=1.0) as response:
            payload = json.loads(response.read())
    except Exception:
        return {}
    if payload.get("ok") and payload.get("server") == "local-asr-server":
        return payload
    return {}


def _read_state(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except (OSError, ValueError):
        return {}


def _api_key(host: str, port: int) -> str:
    return f"{host}:{port}"


def _api_entries(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    entries = state.get("apis")
    if isinstance(entries, dict):
        return {
            str(key): value
            for key, value in entries.items()
            if isinstance(value, dict)
        }
    legacy = state.get("api")
    if isinstance(legacy, dict) and legacy.get("port"):
        host = str(legacy.get("host") or LOCAL_SERVICE_HOST)
        return {_api_key(host, int(legacy["port"])): legacy}
    return {}


def _write_state(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _process_command(pid: int) -> str:
    try:
        result = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            check=False,
            capture_output=True,
            text=True,
            timeout=1.0,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def _list_processes() -> list[tuple[int, str]]:
    try:
        result = subprocess.run(
            ["ps", "-axo", "pid=,command="],
            check=False,
            capture_output=True,
            text=True,
            timeout=2.0,
        )
    except Exception:
        return []
    processes = []
    for line in result.stdout.splitlines():
        fields = line.strip().split(maxsplit=1)
        if len(fields) != 2:
            continue
        try:
            processes.append((int(fields[0]), fields[1]))
        except ValueError:
            continue
    return processes


def _is_closedroom_api_command(command: str) -> bool:
    try:
        tokens = shlex.split(command)
    except ValueError:
        tokens = command.split()
    if not tokens:
        return False

    if Path(tokens[0]).name.casefold() == "closedroom":
        return True

    for index, token in enumerate(tokens[:-1]):
        if (
            "/" in token
            and Path(token).name.casefold() == "local-asr"
            and tokens[index + 1].casefold() in _API_SUBCOMMANDS
        ):
            return True

    for index in range(len(tokens) - 2):
        if (
            tokens[index] == "-m"
            and tokens[index + 1] == "local_asr_server.cli"
            and tokens[index + 2].casefold() in _API_SUBCOMMANDS
        ):
            return True
    return False


def _other_closedroom_api_processes() -> list[tuple[int, str]]:
    current_pid = os.getpid()
    return [
        (pid, command)
        for pid, command in _list_processes()
        if pid != current_pid and _is_closedroom_api_command(command)
    ]


def _is_closedroom_process(pid: int, command: str | None = None) -> bool:
    if pid <= 1 or pid == os.getpid():
        return False
    normalized = (command if command is not None else _process_command(pid)).casefold()
    return any(marker in normalized for marker in _PROCESS_MARKERS)


def _pid_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _wait_until(
    predicate: Callable[[], bool],
    *,
    timeout: float,
    sleep: Callable[[float], None] = time.sleep,
) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        sleep(0.1)
    return predicate()


def terminate_closedroom_process(
    pid: int,
    *,
    command: str | None = None,
    kill: Callable[[int, int], None] = os.kill,
) -> bool:
    """Terminate only a process whose command identifies it as ClosedRoom."""
    if not _is_closedroom_process(pid, command):
        return False
    try:
        kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return True
    if _wait_until(lambda: not _pid_is_alive(pid), timeout=PROCESS_STOP_TIMEOUT_SECONDS):
        return True
    try:
        kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return True
    return _wait_until(lambda: not _pid_is_alive(pid), timeout=1.0)


def prepare_api_port(
    port: int,
    *,
    host: str = LOCAL_SERVICE_HOST,
    state_path: Path | None = None,
) -> None:
    """Enforce one ClosedRoom API instance and ensure the requested port is free."""
    path = state_path or get_runtime_state_file()
    state = _read_state(path)
    entries = _api_entries(state)

    recorded_pids = {
        int(api_state.get("pid") or 0)
        for api_state in entries.values()
        if int(api_state.get("pid") or 0) > 0
    }
    for recorded_pid in sorted(recorded_pids):
        if recorded_pid == os.getpid() or not _pid_is_alive(recorded_pid):
            continue
        if not terminate_closedroom_process(recorded_pid):
            raise PortInUseError(
                f"Recorded runtime PID {recorded_pid} is not a verified ClosedRoom process."
            )

    path.unlink(missing_ok=True)

    for orphan_pid, command in _other_closedroom_api_processes():
        if orphan_pid in recorded_pids:
            continue
        if not terminate_closedroom_process(orphan_pid, command=command):
            raise PortInUseError(
                f"Previous ClosedRoom API PID {orphan_pid} could not be stopped safely."
            )

    if not is_port_open(host, port):
        return

    health = query_closedroom_health(host, port)
    owner_pid = int(health.get("pid") or 0)
    if owner_pid and terminate_closedroom_process(owner_pid):
        if _wait_until(
            lambda: not is_port_open(host, port),
            timeout=PORT_RELEASE_TIMEOUT_SECONDS,
        ):
            return

    if health:
        raise PortInUseError(
            f"ClosedRoom on {host}:{port} could not be stopped safely."
        )
    raise PortInUseError(
        f"Port {host}:{port} is occupied by an unrelated process; it was not terminated."
    )


def register_api_runtime(
    port: int,
    *,
    host: str = LOCAL_SERVICE_HOST,
    state_path: Path | None = None,
) -> None:
    path = state_path or get_runtime_state_file()
    identity = get_app_identity()
    entry = {
        "pid": os.getpid(),
        "host": host,
        "port": port,
        "command": " ".join([str(item) for item in [os.path.basename(os.sys.executable), *os.sys.argv]]),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "bundle_identifier": identity.bundle_identifier,
        "app_version": identity.version,
        "bundled": identity.bundled,
    }
    _write_state(path, {
        "schema_version": RUNTIME_STATE_SCHEMA_VERSION,
        "apis": {_api_key(host, port): entry},
    })


def clear_api_runtime(
    port: int,
    *,
    host: str = LOCAL_SERVICE_HOST,
    state_path: Path | None = None,
    pid: int | None = None,
) -> None:
    path = state_path or get_runtime_state_file()
    state = _read_state(path)
    entries = _api_entries(state)
    key = _api_key(host, port)
    api_state = entries.get(key, {})
    expected_pid = os.getpid() if pid is None else pid
    if int(api_state.get("pid") or 0) == expected_pid:
        entries.pop(key, None)
        if entries:
            _write_state(path, {
                "schema_version": RUNTIME_STATE_SCHEMA_VERSION,
                "apis": entries,
            })
        else:
            path.unlink(missing_ok=True)
