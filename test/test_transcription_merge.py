from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient

from local_asr_server.server import create_app
from local_asr_server.transcriptions import TranscriptionStore

class TranscriptionMergeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings_dir = tempfile.TemporaryDirectory()
        
        # Override settings for tests
        self.transcriptions_dir = Path(self.temp_dir.name) / "transcriptions"
        self.transcriptions_dir.mkdir(parents=True, exist_ok=True)
        
        # Patch settings
        self.settings_patcher = patch("local_asr_server.transcriptions.load_settings")
        self.mock_load_settings = self.settings_patcher.start()
        self.mock_load_settings.return_value = {
            "transcriptions_dir": str(self.transcriptions_dir),
            "recordings_dir": self.temp_dir.name,
            "gemini_api_key": "",
            "llm_provider": "mock",
            "default_model": "test-model",
            "default_language": "it",
            "default_task": "transcribe",
            "default_word_timestamps": False,
            "default_condition_on_previous": True,
        }

        self.app = create_app(
            default_model="test-model",
            recordings_dir=Path(self.temp_dir.name),
        )
        self.client = TestClient(self.app)
        self.store = TranscriptionStore()

    def tearDown(self) -> None:
        self.settings_patcher.stop()
        self.client.close()
        self.temp_dir.cleanup()
        self.settings_dir.cleanup()

    def test_merge_logic_directly(self) -> None:
        # Create two sample transcriptions
        t1 = self.store.save(
            payload={
                "text": "Hello world from part one.",
                "segments": [
                    {"id": 0, "start": 0.0, "end": 2.5, "text": "Hello world"},
                    {"id": 1, "start": 2.5, "end": 5.0, "text": "from part one."}
                ],
                "model": "model-a",
                "language": "en",
                "stats": {"time_total_seconds": 1.2}
            },
            audio_filename="part1.webm",
            recording_id="rec-1"
        )
        
        t2 = self.store.save(
            payload={
                "text": "Goodbye world from part two.",
                "segments": [
                    {"id": 0, "start": 0.0, "end": 3.0, "text": "Goodbye world"},
                    {"id": 1, "start": 3.0, "end": 6.0, "text": "from part two."}
                ],
                "model": "model-b",
                "language": "en",
                "stats": {"time_total_seconds": 1.8}
            },
            audio_filename="part2.webm",
            recording_id="rec-2"
        )

        merged = self.store.merge(
            transcription_ids=[t1["id"], t2["id"]],
            title="Combined Meeting"
        )

        # Check basic details
        self.assertEqual(merged["audio_filename"], "Combined Meeting")
        self.assertEqual(merged["language"], "en")
        self.assertIn("--- part1.webm ---", merged["text"])
        self.assertIn("--- part2.webm ---", merged["text"])
        
        # Check segment count and offsets
        segments = merged["segments"]
        self.assertEqual(len(segments), 4)
        
        # First segments should remain unchanged
        self.assertEqual(segments[0]["start"], 0.0)
        self.assertEqual(segments[0]["end"], 2.5)
        
        # Subsequent segments should shift by max_end of previous segment sequence (which is 5.0)
        self.assertEqual(segments[2]["start"], 0.0 + 5.0)
        self.assertEqual(segments[2]["end"], 3.0 + 5.0)

        # Check merged sources info
        self.assertEqual(len(merged["merged_sources"]), 2)
        self.assertEqual(merged["merged_sources"][0]["id"], t1["id"])

        # Originals should now be hidden from history list!
        items, total = self.store.list()
        # Only the merged one is visible
        self.assertEqual(total, 1)
        self.assertEqual(items[0]["id"], merged["id"])

        # Split back
        restored = self.store.split(merged["id"])
        self.assertEqual(len(restored), 2)
        self.assertIn(t1["id"], restored)
        self.assertIn(t2["id"], restored)

        # Merge transcript should be deleted, and originals visible again
        items, total = self.store.list()
        self.assertEqual(total, 2)
        visible_ids = [item["id"] for item in items]
        self.assertIn(t1["id"], visible_ids)
        self.assertIn(t2["id"], visible_ids)

    def test_merge_api_endpoint(self) -> None:
        # Create two sample transcriptions
        t1 = self.store.save(
            payload={"text": "First part", "segments": [], "model": "m", "language": "it"},
            audio_filename="audio1.webm"
        )
        t2 = self.store.save(
            payload={"text": "Second part", "segments": [], "model": "m", "language": "it"},
            audio_filename="audio2.webm"
        )

        response = self.client.post(
            "/v1/transcriptions/merge",
            json={
                "transcription_ids": [t1["id"], t2["id"]],
                "title": "API Combined"
            }
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["audio_filename"], "API Combined")
        self.assertIn("--- audio1.webm ---", data["text"])
        self.assertEqual(len(data["merged_sources"]), 2)

        # Verify Split endpoint works
        split_response = self.client.post(f"/v1/transcriptions/{data['id']}/split")
        self.assertEqual(split_response.status_code, 200)
        self.assertTrue(split_response.json()["ok"])

if __name__ == "__main__":
    unittest.main()
