from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from local_asr_server.server import AudioRouter, create_app


class RecordingApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.app = create_app(
            default_model="test-model",
            recordings_dir=Path(self.temp_dir.name),
        )
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()
        self.temp_dir.cleanup()

    @patch("local_asr_server.server._transcribe")
    def test_stop_only_saves_audio_without_transcribing(self, transcribe) -> None:
        created = self.client.post(
            "/v1/recordings",
            json={
                "title": "Call",
                "mime_type": "audio/webm;codecs=opus",
                "language": "it",
            },
        )
        self.assertEqual(created.status_code, 201)
        recording_id = created.json()["id"]

        chunk = self.client.post(
            f"/v1/recordings/{recording_id}/chunks",
            data={"sequence": "0"},
            files={"file": ("chunk.webm", b"audio-data", "audio/webm")},
        )
        self.assertEqual(chunk.status_code, 200)

        stopped = self.client.post(f"/v1/recordings/{recording_id}/stop")
        self.assertEqual(stopped.status_code, 202)
        self.assertEqual(stopped.json()["status"], "recorded")
        transcribe.assert_not_called()

        audio = self.client.get(f"/v1/recordings/{recording_id}/audio")
        self.assertEqual(audio.status_code, 200)
        self.assertEqual(audio.content, b"audio-data")
        transcribe.assert_not_called()

    def test_empty_recording_cannot_be_stopped(self) -> None:
        created = self.client.post(
            "/v1/recordings",
            json={"title": "Empty", "mime_type": "audio/webm"},
        )
        recording_id = created.json()["id"]

        stopped = self.client.post(f"/v1/recordings/{recording_id}/stop")

        self.assertEqual(stopped.status_code, 409)

    @patch.object(AudioRouter, "route_to_multi_output")
    def test_create_recording_does_not_change_audio_route(self, route) -> None:
        created = self.client.post(
            "/v1/recordings",
            json={"title": "Call", "mime_type": "audio/webm"},
        )

        self.assertEqual(created.status_code, 201)
        route.assert_not_called()

    @patch.object(AudioRouter, "get_status")
    def test_audio_status_endpoint(self, get_status) -> None:
        get_status.return_value = {
            "ok": True,
            "platform": "darwin",
            "ready_to_record": True,
            "input_device": "MacBook Microphone",
            "output_device": "Local ASR Output - MacBook Speakers",
        }

        response = self.client.get("/v1/system/audio/status")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ready_to_record"])

    @patch.object(AudioRouter, "get_status")
    @patch.object(AudioRouter, "route_to_multi_output", return_value=True)
    def test_audio_activate_endpoint(self, route, get_status) -> None:
        get_status.return_value = {
            "ok": True,
            "platform": "darwin",
            "ready_to_record": True,
            "input_device": "MacBook Microphone",
            "output_device": "Local ASR Output - MacBook Speakers",
        }

        response = self.client.post("/v1/system/audio/activate")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        route.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
