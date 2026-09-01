from __future__ import annotations

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "real_environment_smoke.py"


def load_module():
    spec = importlib.util.spec_from_file_location("real_environment_smoke", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load real_environment_smoke.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RealEnvironmentSmokeHelpersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.smoke = load_module()

    def test_newest_only_returns_a_run_owned_recording(self) -> None:
        before = {"old-a", "old-b"}
        recordings = [
            {"id": "old-a", "created_at": "2026-01-01T00:00:00Z"},
            {"id": "new-1", "created_at": "2026-01-02T00:00:00Z"},
            {"id": "new-2", "created_at": "2026-01-03T00:00:00Z"},
        ]
        self.assertEqual(self.smoke.newest(before, recordings)["id"], "new-2")
        self.assertIsNone(self.smoke.newest(before, recordings[:1]))

    def test_source_tracks_require_persisted_bytes_and_chunks(self) -> None:
        recording = {
            "audio_tracks": [
                {"source": "mic", "bytes_written": 40, "chunk_count": 1},
                {"source": "system", "bytes_written": 80, "chunk_count": 2},
                {"source": "mixed", "bytes_written": 0, "chunk_count": 0},
            ]
        }
        self.assertEqual(self.smoke.source_tracks_with_data(recording), {"mic", "system"})

    def test_evidence_is_separate_from_immutable_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            destination = self.smoke.evidence_path(root, None)
            self.assertTrue(str(destination).startswith(str(root / "dist" / "evidence" / "real-environment")))
            self.assertNotIn("dist/artifacts", str(destination))

    def test_permission_remediation_is_specific_and_rerunnable(self) -> None:
        steps = self.smoke.permissions_help(
            {"microphone": "denied", "screen_capture": "required"},
            accessibility=True,
        )
        text = " ".join(steps)
        self.assertIn("Accessibility", text)
        self.assertIn("Microphone", text)
        self.assertIn("Screen & System Audio Recording", text)
        self.assertIn("Re-run", text)

    def test_wait_propagates_permission_errors(self) -> None:
        def blocked() -> bool:
            raise PermissionError("terminal_accessibility_permission_required")

        with self.assertRaisesRegex(PermissionError, "terminal_accessibility_permission_required"):
            self.smoke.wait(blocked, timeout=1, interval=0)

    def test_ui_timeout_is_normalized_to_retryable_runtime_error(self) -> None:
        timeout = subprocess.TimeoutExpired(cmd=["osascript"], timeout=5)
        with mock.patch.object(self.smoke, "osascript", side_effect=timeout):
            with self.assertRaisesRegex(RuntimeError, "ui_automation_timeout:window"):
                self.smoke.ui(123, "window")

    def test_ui_ready_retries_a_transient_timeout(self) -> None:
        with mock.patch.object(
            self.smoke,
            "ui",
            side_effect=[RuntimeError("ui_automation_timeout:window"), "true"],
        ) as ui:
            with mock.patch.object(self.smoke.time, "sleep", return_value=None):
                self.assertTrue(self.smoke.ui_ready(123, timeout=1))
        self.assertEqual(ui.call_count, 2)

    def test_press_retries_a_transient_ui_failure(self) -> None:
        with mock.patch.object(
            self.smoke,
            "ui",
            side_effect=[RuntimeError("ui_automation_timeout:press"), "pressed"],
        ) as ui:
            with mock.patch.object(self.smoke.time, "sleep", return_value=None):
                self.smoke.press(123, ("Start Recording",), timeout=1)
        self.assertEqual(ui.call_count, 2)


if __name__ == "__main__":
    unittest.main()
