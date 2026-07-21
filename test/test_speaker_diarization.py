from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from local_asr_server.speaker_diarization import LocalSpeakerDiarizationService


class _Store:
    def __init__(self) -> None:
        self.saved = None

    def save_speaker_diarization(self, recording_id, payload):
        self.saved = (recording_id, payload)


class SpeakerDiarizationTests(unittest.TestCase):
    def test_assigns_local_clusters_and_preserves_provider_clusters(self) -> None:
        store = _Store()
        helper_result = {
            "engine": "fluidaudio-community-1",
            "tracks": {
                "system": {
                    "segments": [
                        {"speaker": "0", "start": 0.0, "end": 2.0},
                        {"speaker": "1", "start": 2.0, "end": 4.0},
                    ]
                }
            },
        }
        service = LocalSpeakerDiarizationService(runner=lambda _inputs: helper_result)
        track = {"id": "system"}
        result = {
            "segments": [
                {"start": 0.1, "end": 1.9, "text": "Uno"},
                {"start": 2.1, "end": 3.9, "text": "Due", "provider_speaker": "cloud-S2"},
            ]
        }
        with tempfile.TemporaryDirectory() as tmp, patch(
            "local_asr_server.speaker_diarization.load_settings",
            return_value={"speaker_diarization_enabled": True, "speaker_diarization_minimum_overlap": 0.25},
        ):
            summary = service.process(
                store,
                "recording-id",
                [(track, Path(tmp) / "system.wav")],
                [{"track": track, "result": result}],
            )

        self.assertEqual(result["segments"][0]["provider_speaker"], "system:0")
        self.assertEqual(result["segments"][1]["provider_speaker"], "cloud-S2")
        self.assertEqual(summary["assigned_segments"], 1)
        self.assertEqual(summary["cluster_count"], 2)
        self.assertEqual(summary["clusters_by_track"]["system"], ["system:0", "system:1"])
        self.assertEqual(summary["unassigned_clusters_by_track"]["system"], ["system:1"])
        self.assertIn("fluidaudio-speaker-diarization", summary["model_path"])
        self.assertEqual(summary["details"]["model_path"], summary["model_path"])
        self.assertEqual(store.saved[0], "recording-id")

    def test_failure_is_persisted_without_raising(self) -> None:
        store = _Store()
        service = LocalSpeakerDiarizationService(runner=lambda _inputs: (_ for _ in ()).throw(RuntimeError("boom")))
        with patch(
            "local_asr_server.speaker_diarization.load_settings",
            return_value={"speaker_diarization_enabled": True},
        ):
            summary = service.process(store, "recording-id", [({"id": "mic"}, Path("mic.wav"))], [])
        self.assertEqual(summary["status"], "failed")
        self.assertEqual(store.saved[1]["error"], "boom")

    def test_force_runs_even_when_persisted_setting_is_disabled(self) -> None:
        store = _Store()
        service = LocalSpeakerDiarizationService(runner=lambda _inputs: {
            "engine": "fluidaudio-community-1",
            "tracks": {"system": {"segments": []}},
        })
        with patch(
            "local_asr_server.speaker_diarization.load_settings",
            return_value={"speaker_diarization_enabled": False},
        ):
            summary = service.process(
                store,
                "recording-id",
                [({"id": "system"}, Path("system.wav"))],
                [{"track": {"id": "system"}, "result": {"segments": []}}],
                force=True,
            )
        self.assertEqual(summary["status"], "completed")


if __name__ == "__main__":
    unittest.main()
