from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
