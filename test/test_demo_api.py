from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from local_asr_server.server import create_app


class DemoApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_dir.name)
        self.recordings_dir = self.root / "recordings"
        self.transcriptions_dir = self.root / "transcriptions"
        self.recordings_dir.mkdir()
        self.transcriptions_dir.mkdir()
        self.settings = {
            "recordings_dir": str(self.recordings_dir),
            "transcriptions_dir": str(self.transcriptions_dir),
            "gemini_api_key": "",
            "llm_provider": "mock",
        }
        self.transcription_settings = patch(
            "local_asr_server.transcriptions.load_settings",
            return_value=self.settings,
        )
        self.runtime_settings = patch(
            "local_asr_server.settings.load_settings",
            return_value=self.settings,
        )
        self.transcription_settings.start()
        self.runtime_settings.start()
        self.app = create_app(recordings_dir=self.recordings_dir, enable_auth=False)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()
        self.runtime_settings.stop()
        self.transcription_settings.stop()
        self.temporary_dir.cleanup()

    def test_populate_and_clear_mock_data(self) -> None:
        populated = self.client.post("/v1/system/mock-data", json={"lang": "en"})
        self.assertEqual(populated.status_code, 200)
        self.assertEqual(populated.json(), {"success": True})

        meetings = self.client.get("/v1/meetings").json()["items"]
        self.assertEqual(len(meetings), 4)
        self.assertTrue(any(self.recordings_dir.glob("*/mock-*")))
        self.assertTrue(any(self.transcriptions_dir.glob("mock-transcript-*.json")))

        cleared = self.client.post("/v1/system/clear-mock-data")
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(cleared.json(), {"success": True})
        self.assertEqual(self.client.get("/v1/meetings").json()["items"], [])
        self.assertFalse(any(self.recordings_dir.glob("*/mock-*")))
        self.assertFalse(any(self.transcriptions_dir.glob("mock-transcript-*")))


if __name__ == "__main__":
    unittest.main()
