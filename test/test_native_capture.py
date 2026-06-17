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
    print(json.dumps({'ok': True}))
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


if __name__ == "__main__":
    unittest.main()
