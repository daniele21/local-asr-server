from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from local_asr_server.paths import (
    get_native_capture_helper_path,
    get_runtime_state_file,
    get_service_log_file,
)


class BundlePathTests(unittest.TestCase):
    def test_runtime_state_file_lives_in_app_support(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            with patch("local_asr_server.paths.Path.home", return_value=Path(temp)):
                self.assertEqual(
                    get_runtime_state_file(),
                    Path(temp) / "Library" / "Application Support" / "ClosedRoom" / "runtime-state.json",
                )

    def test_service_log_file_lives_in_logs_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            with patch("local_asr_server.paths.Path.home", return_value=Path(temp)):
                self.assertEqual(
                    get_service_log_file("llm-server"),
                    Path(temp) / "Library" / "Logs" / "ClosedRoom" / "llm-server.log",
                )

    def test_native_capture_helper_prefers_embedded_app_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            contents_dir = Path(temp) / "ClosedRoom.app" / "Contents"
            executable = contents_dir / "MacOS" / "ClosedRoom"
            bundle_dir = contents_dir / "Frameworks"
            helper = (
                contents_dir
                / "Helpers"
                / "ClosedRoomNativeCapture.app"
                / "Contents"
                / "MacOS"
                / "ClosedRoomNativeCapture"
            )
            helper.parent.mkdir(parents=True)
            helper.touch()
            executable.parent.mkdir(parents=True)
            executable.touch()

            with (
                patch("local_asr_server.paths.is_bundled", return_value=True),
                patch("local_asr_server.paths.get_bundle_dir", return_value=bundle_dir),
                patch("local_asr_server.paths.sys.executable", str(executable)),
            ):
                self.assertEqual(get_native_capture_helper_path(), helper.resolve())

    def test_native_capture_helper_falls_back_to_legacy_bundled_binary(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            contents_dir = Path(temp) / "ClosedRoom.app" / "Contents"
            executable = contents_dir / "MacOS" / "ClosedRoom"
            bundle_dir = contents_dir / "Frameworks"
            legacy = bundle_dir / "native-capture-helper"
            legacy.parent.mkdir(parents=True)
            legacy.touch()
            executable.parent.mkdir(parents=True)
            executable.touch()

            with (
                patch("local_asr_server.paths.is_bundled", return_value=True),
                patch("local_asr_server.paths.get_bundle_dir", return_value=bundle_dir),
                patch("local_asr_server.paths.sys.executable", str(executable)),
            ):
                self.assertEqual(get_native_capture_helper_path(), legacy.resolve())


if __name__ == "__main__":
    unittest.main()
