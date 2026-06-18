from __future__ import annotations

import stat
import tempfile
import time
import unittest
from pathlib import Path

from local_asr_server.native_capture import NativeCaptureManager


class NativeCaptureManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.helper = self.root / "helper.py"
        self.helper.write_text(
            """#!/usr/bin/env python3
import json, sys, time
cmd = sys.argv[1]
if cmd == 'capabilities':
    print(json.dumps({'available': True, 'backend': 'native', 'modes': ['both']}))
elif cmd == 'permissions':
    print(json.dumps({'ok': True, 'microphone': 'authorized', 'screen_capture': 'granted', 'modes': {'mic_only': {'ok': True}, 'pc_only': {'ok': True}, 'both': {'ok': True}}}))
elif cmd == 'request-permissions':
    print(json.dumps({'ok': True, 'requested': True}))
elif cmd == 'diagnostics':
    print(json.dumps({'bundle_identifier': 'com.closedroom.nativecapture', 'code_signature': 'signed', 'screen_capture': 'granted'}))
elif cmd == 'start':
    print(json.dumps({'type': 'ready'}), flush=True)
    time.sleep(0.05)
    print(json.dumps({'type': 'stopped'}), flush=True)
else:
    print(json.dumps({'type': 'stopped'}))
""",
            encoding="utf-8",
        )
        self.helper.chmod(self.helper.stat().st_mode | stat.S_IXUSR)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_capabilities_and_event_drain(self) -> None:
        manager = NativeCaptureManager(helper_path=self.helper)

        self.assertTrue(manager.capabilities()["available"])
        started = manager.start("rec-1", self.root, "both")
        time.sleep(0.2)
        events = manager.drain_events("rec-1")

        self.assertEqual(started["backend"], "native")
        self.assertEqual([event["type"] for event in events], ["ready", "stopped"])

    def test_validate_audio_file_behavior(self) -> None:
        from local_asr_server.native_capture import validate_audio_file
        
        # Test file not found
        res = validate_audio_file(self.root / "nonexistent.wav")
        self.assertFalse(res["valid"])
        self.assertEqual(res["error"], "file_not_found")
        
        # Test empty file
        empty_file = self.root / "empty.wav"
        empty_file.touch()
        res = validate_audio_file(empty_file)
        self.assertFalse(res["valid"])
        self.assertEqual(res["error"], "file_empty")

    def test_stop_session_processes_events(self) -> None:
        manager = NativeCaptureManager(helper_path=self.helper)
        started = manager.start("rec-2", self.root, "both")
        self.assertEqual(started["status"], "starting")
        
        # Let the process finish
        time.sleep(0.5)
        
        # Stop session
        result = manager.stop("rec-2")
        self.assertEqual(result["status"], "stopped")
        
        # Check that events are returned
        event_types = [evt["type"] for evt in result["events"]]
        self.assertIn("ready", event_types)
        self.assertIn("stopped", event_types)

    def test_ensure_permissions_returns_ready_state_without_prompt(self) -> None:
        manager = NativeCaptureManager(helper_path=self.helper)
        result = manager.ensure_permissions("both")

        self.assertTrue(result["ok"])
        self.assertFalse(result["requested"])
        self.assertEqual(result["permissions"]["microphone"], "authorized")
        self.assertEqual(result["diagnostics"]["bundle_identifier"], "com.closedroom.nativecapture")

    def test_ensure_permissions_rejects_invalid_mode(self) -> None:
        manager = NativeCaptureManager(helper_path=self.helper)

        with self.assertRaises(ValueError):
            manager.ensure_permissions("browser")


if __name__ == "__main__":
    unittest.main()
