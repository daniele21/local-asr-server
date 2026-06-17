from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from local_asr_server.audio_diagnostics import build_quality_report


class AudioDiagnosticsTests(unittest.TestCase):
    def test_non_empty_unprobeable_track_is_not_user_warning(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "mic.webm"
            path.write_bytes(b"not-a-real-webm-but-not-empty")

            with patch("local_asr_server.audio_diagnostics._find_ffprobe", return_value=None):
                report = build_quality_report([
                    ({"id": "mic"}, path),
                ])

        self.assertEqual(report["warnings"], [])
        self.assertEqual(report["tracks"]["mic"]["error"], "ffprobe_missing")

    def test_empty_track_is_user_warning(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "system.webm"
            path.write_bytes(b"")

            with patch("local_asr_server.audio_diagnostics._find_ffprobe", return_value=None):
                report = build_quality_report([
                    ({"id": "system"}, path),
                ])

        self.assertEqual(report["warnings"], ["track_system_empty"])


if __name__ == "__main__":
    unittest.main()
