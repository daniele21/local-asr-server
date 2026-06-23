from __future__ import annotations

import unittest
from unittest.mock import patch

import numpy as np

from local_asr_server.schemas import TranscribePathRequest, TranscribeRecordingRequest
from local_asr_server.transcriber import VAD_GUIDED_DEFAULT, _transcribe_vad_guided


class VadGuidedTranscriptionTests(unittest.TestCase):
    def _kwargs(self) -> dict:
        return {
            "audio_path": "/tmp/meeting.wav",
            "model": "test-model",
            "language": "it",
            "task": "transcribe",
            "word_timestamps": False,
            "initial_prompt": None,
            "temperature": None,
            "condition_on_previous_text": True,
            "verbose": None,
        }

    def test_vad_guided_is_disabled_by_default(self) -> None:
        self.assertFalse(VAD_GUIDED_DEFAULT)
        self.assertFalse(TranscribePathRequest(file="/tmp/meeting.wav").vad_guided)
        self.assertFalse(TranscribeRecordingRequest().vad_guided)

    @patch("local_asr_server.transcriber._transcribe")
    @patch("local_asr_server.audio_intelligence.vad.detect_speech_windows_vad", return_value=[])
    @patch("local_asr_server.audio_intelligence.audio_io.load_audio_samples")
    def test_no_speech_windows_falls_back_to_full_track(self, load_samples, _detect_windows, transcribe) -> None:
        load_samples.return_value = np.zeros(16_000, dtype=np.float32)
        transcribe.return_value = {"text": "Voce presente", "segments": [{"id": 0}]}

        result = _transcribe_vad_guided(**self._kwargs())

        transcribe.assert_called_once_with(**self._kwargs())
        self.assertEqual(result["text"], "Voce presente")
        self.assertEqual(
            result["metadata"],
            {
                "vad_guided": True,
                "vad_fallback": True,
                "vad_fallback_reason": "no_speech_windows_detected",
                "vad_windows_count": 0,
            },
        )

    @patch("local_asr_server.transcriber._transcribe")
    @patch("local_asr_server.audio_intelligence.vad.detect_speech_windows_vad")
    @patch("local_asr_server.audio_intelligence.audio_io.load_audio_samples")
    def test_empty_vad_window_results_fall_back_to_full_track(self, load_samples, detect_windows, transcribe) -> None:
        load_samples.return_value = np.zeros(32_000, dtype=np.float32)
        detect_windows.return_value = [{"start": 0.5, "end": 1.0}]
        transcribe.side_effect = [
            {"text": "", "segments": []},
            {"text": "Trascrizione completa", "segments": [{"id": 0}]},
        ]

        result = _transcribe_vad_guided(**self._kwargs())

        self.assertEqual(transcribe.call_count, 2)
        self.assertEqual(result["text"], "Trascrizione completa")
        self.assertEqual(result["metadata"]["vad_fallback_reason"], "vad_windows_produced_empty_transcript")
        self.assertEqual(result["metadata"]["vad_windows_count"], 1)


if __name__ == "__main__":
    unittest.main()
