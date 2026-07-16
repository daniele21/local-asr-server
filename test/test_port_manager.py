from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from local_asr_server.runtime.port_manager import (
    PortInUseError,
    _is_closedroom_api_command,
    prepare_api_port,
    register_api_runtime,
    terminate_closedroom_process,
)


class PortManagerTests(unittest.TestCase):
    def test_foreign_process_is_never_terminated(self) -> None:
        kill_calls = []
        result = terminate_closedroom_process(
            4321,
            command="/usr/bin/postgres -p 1236",
            kill=lambda pid, sig: kill_calls.append((pid, sig)),
        )
        self.assertFalse(result)
        self.assertEqual(kill_calls, [])

    def test_prepare_rejects_unrelated_port_owner(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, \
             patch(
                 "local_asr_server.runtime.port_manager._other_closedroom_api_processes",
                 return_value=[],
             ), \
             patch(
                 "local_asr_server.runtime.port_manager.is_port_open",
                 return_value=True,
             ), patch(
                 "local_asr_server.runtime.port_manager.query_closedroom_health",
                 return_value={},
             ):
            with self.assertRaisesRegex(PortInUseError, "unrelated process"):
                prepare_api_port(
                    1236,
                    state_path=Path(tmp) / "runtime-state.json",
                )

    def test_prepare_stops_verified_closedroom_health_owner(self) -> None:
        port_states = iter([True, False])
        with tempfile.TemporaryDirectory() as tmp, \
             patch(
                 "local_asr_server.runtime.port_manager._other_closedroom_api_processes",
                 return_value=[],
             ), \
             patch(
                 "local_asr_server.runtime.port_manager.is_port_open",
                 side_effect=lambda *_: next(port_states, False),
             ), patch(
                 "local_asr_server.runtime.port_manager.query_closedroom_health",
                 return_value={
                     "ok": True,
                     "server": "local-asr-server",
                     "pid": 4321,
                 },
             ), patch(
                 "local_asr_server.runtime.port_manager.terminate_closedroom_process",
                 return_value=True,
             ) as terminate:
            prepare_api_port(
                1236,
                state_path=Path(tmp) / "runtime-state.json",
            )
        terminate.assert_called_once_with(4321)

    def test_register_replaces_previous_port_entry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "runtime-state.json"
            with patch(
                "local_asr_server.runtime.port_manager.os.getpid",
                return_value=1001,
            ):
                register_api_runtime(1236, state_path=state_path)
            with patch(
                "local_asr_server.runtime.port_manager.os.getpid",
                return_value=1002,
            ):
                register_api_runtime(1237, state_path=state_path)

            payload = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(
                set(payload["apis"]),
                {"127.0.0.1:1237"},
            )
            self.assertEqual(payload["apis"]["127.0.0.1:1237"]["pid"], 1002)

    def test_prepare_removes_dead_stale_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "runtime-state.json"
            state_path.write_text(json.dumps({
                "schema_version": 1,
                "apis": {
                    "127.0.0.1:1236": {
                        "pid": 999999,
                        "host": "127.0.0.1",
                        "port": 1236,
                    },
                },
            }), encoding="utf-8")
            with patch(
                "local_asr_server.runtime.port_manager._pid_is_alive",
                return_value=False,
            ), patch(
                "local_asr_server.runtime.port_manager.is_port_open",
                return_value=False,
            ), patch(
                "local_asr_server.runtime.port_manager._other_closedroom_api_processes",
                return_value=[],
            ):
                prepare_api_port(1236, state_path=state_path)
            self.assertFalse(state_path.exists())

    def test_prepare_stops_registered_instances_on_other_ports(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "runtime-state.json"
            state_path.write_text(json.dumps({
                "schema_version": 1,
                "apis": {
                    "127.0.0.1:1237": {
                        "pid": 4321,
                        "host": "127.0.0.1",
                        "port": 1237,
                    },
                },
            }), encoding="utf-8")
            with patch(
                "local_asr_server.runtime.port_manager._pid_is_alive",
                return_value=True,
            ), patch(
                "local_asr_server.runtime.port_manager.terminate_closedroom_process",
                return_value=True,
            ) as terminate, patch(
                "local_asr_server.runtime.port_manager._other_closedroom_api_processes",
                return_value=[],
            ), patch(
                "local_asr_server.runtime.port_manager.is_port_open",
                return_value=False,
            ):
                prepare_api_port(1236, state_path=state_path)
            terminate.assert_called_once_with(4321)
            self.assertFalse(state_path.exists())

    def test_prepare_stops_unregistered_orphan_api_process(self) -> None:
        command = "/usr/bin/python /project/.venv/bin/local-asr serve"
        with tempfile.TemporaryDirectory() as tmp, patch(
            "local_asr_server.runtime.port_manager._other_closedroom_api_processes",
            return_value=[(4321, command)],
        ), patch(
            "local_asr_server.runtime.port_manager.terminate_closedroom_process",
            return_value=True,
        ) as terminate, patch(
            "local_asr_server.runtime.port_manager.is_port_open",
            return_value=False,
        ):
            prepare_api_port(
                1236,
                state_path=Path(tmp) / "runtime-state.json",
            )
        terminate.assert_called_once_with(4321, command=command)

    def test_api_command_detection_excludes_wrappers_and_workers(self) -> None:
        self.assertTrue(_is_closedroom_api_command(
            "/usr/bin/python /project/.venv/bin/local-asr serve"
        ))
        self.assertTrue(_is_closedroom_api_command(
            "/usr/bin/python -m local_asr_server.cli app"
        ))
        self.assertTrue(_is_closedroom_api_command(
            "/Applications/ClosedRoom.app/Contents/MacOS/ClosedRoom"
        ))
        self.assertFalse(_is_closedroom_api_command("uv run local-asr serve"))
        self.assertFalse(_is_closedroom_api_command(
            "/usr/bin/python -m local_asr_server.cli transcribe"
        ))
        self.assertFalse(_is_closedroom_api_command(
            "/Applications/ClosedRoomNativeCapture.app/Contents/MacOS/ClosedRoomNativeCapture"
        ))


if __name__ == "__main__":
    unittest.main()
