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
        self.transcriptions_dir = Path(self.temp_dir.name) / "transcriptions"
        self.transcriptions_dir.mkdir(parents=True, exist_ok=True)
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
            enable_auth=False,
        )
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.settings_patcher.stop()
        self.client.close()
        self.temp_dir.cleanup()

    @patch("local_asr_server.server.transcribe_file_sync")
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

    def test_empty_recording_can_be_stopped(self) -> None:
        created = self.client.post(
            "/v1/recordings",
            json={"title": "Empty", "mime_type": "audio/webm"},
        )
        recording_id = created.json()["id"]

        stopped = self.client.post(f"/v1/recordings/{recording_id}/stop")

        self.assertEqual(stopped.status_code, 202)
        self.assertEqual(stopped.json()["status"], "recorded")

    def test_recording_project_does_not_attach_transcription_by_filename_only(self) -> None:
        self.app.state.transcription_store.save(
            {
                "text": "Trascrizione di un altro audio",
                "segments": [],
                "model": "test-model",
                "language": "it",
            },
            audio_filename="Untitled recording.webm",
        )
        created = self.client.post(
            "/v1/recordings",
            json={
                "title": "Untitled recording",
                "mime_type": "audio/webm;codecs=opus",
                "language": "it",
                "capture_mode": "both",
            },
        )
        recording_id = created.json()["id"]

        response = self.client.get(f"/v1/recordings/{recording_id}/project")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["transcription"])

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

    def test_protected_api_requires_local_session(self) -> None:
        app = create_app(
            default_model="test-model",
            recordings_dir=Path(self.temp_dir.name),
            enable_auth=True,
        )
        client = TestClient(app)
        try:
            unauthorized = client.post(
                "/v1/recordings",
                json={"title": "Call", "mime_type": "audio/webm"},
            )
            session = client.get("/v1/session")
            authorized = client.post(
                "/v1/recordings",
                json={"title": "Call", "mime_type": "audio/webm"},
            )

            self.assertEqual(unauthorized.status_code, 401)
            self.assertEqual(session.status_code, 200)
            self.assertTrue(session.json()["auth_enabled"])
            self.assertEqual(authorized.status_code, 201)
        finally:
            client.close()

    def test_capture_capabilities_endpoint_reports_fallback(self) -> None:
        response = self.client.get("/v1/capture/capabilities")

        self.assertEqual(response.status_code, 200)
        self.assertIn(response.json()["default_backend"], {"native", "browser"})
        self.assertIn("native", response.json())

    @patch("local_asr_server.server.transcribe_file_sync")
    def test_transcribe_recording_splits_tracks_and_merges_timeline(self, transcribe) -> None:
        transcribe.side_effect = [
            {
                "text": "Ciao",
                "language": "it",
                "segments": [{"id": 0, "start": 2.0, "end": 3.0, "text": "Ciao"}],
            },
            {
                "text": "Salve",
                "language": "it",
                "segments": [{"id": 0, "start": 1.0, "end": 1.5, "text": "Salve"}],
            },
        ]
        created = self.client.post(
            "/v1/recordings",
            json={
                "title": "Call",
                "mime_type": "audio/webm;codecs=opus",
                "language": "it",
                "capture_mode": "both",
            },
        )
        recording_id = created.json()["id"]
        for track_id, content in {"mic": b"mic", "system": b"sys", "mixed": b"mix"}.items():
            response = self.client.post(
                f"/v1/recordings/{recording_id}/tracks/{track_id}/chunks",
                data={"sequence": "0"},
                files={"file": (f"{track_id}.webm", content, "audio/webm")},
            )
            self.assertEqual(response.status_code, 200)
        self.client.post(f"/v1/recordings/{recording_id}/stop")

        response = self.client.post(
            f"/v1/recordings/{recording_id}/transcriptions",
            json={"language": "it", "response_format": "verbose_json"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(transcribe.call_count, 2)
        self.assertEqual([segment["speaker_label"] for segment in data["segments"]], ["Computer", "Tu"])
        self.assertIn("[00:01] Computer: Salve", data["text"])
        self.assertIn("[00:02] Tu: Ciao", data["text"])
        self.assertEqual({track["id"] for track in data["source_tracks"]}, {"mic", "system"})

    @patch("local_asr_server.server.transcribe_file_sync")
    def test_transcription_job_for_recording(self, transcribe) -> None:
        transcribe.return_value = {
            "text": "Ciao",
            "language": "it",
            "segments": [{"id": 0, "start": 0.0, "end": 1.0, "text": "Ciao"}],
        }
        created = self.client.post(
            "/v1/recordings",
            json={"title": "Call", "mime_type": "audio/webm;codecs=opus", "capture_mode": "mic_only"},
        )
        recording_id = created.json()["id"]
        self.client.post(
            f"/v1/recordings/{recording_id}/tracks/mic/chunks",
            data={"sequence": "0"},
            files={"file": ("mic.webm", b"mic", "audio/webm")},
        )
        self.client.post(f"/v1/recordings/{recording_id}/stop")

        job = self.client.post(
            f"/v1/recordings/{recording_id}/transcription-jobs",
            json={"language": "it", "response_format": "verbose_json"},
        )
        self.assertEqual(job.status_code, 202)
        job_id = job.json()["id"]

        for _ in range(20):
            status = self.client.get(f"/v1/jobs/{job_id}").json()
            if status["status"] == "completed":
                break
            import time
            time.sleep(0.05)

        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["result"]["text"], "[00:00] Tu: Ciao")


if __name__ == "__main__":
    unittest.main()
