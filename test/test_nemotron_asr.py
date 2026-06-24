from __future__ import annotations

import sys
import types
import unittest
from unittest.mock import Mock, patch

from local_asr_server.asr_models import NEMOTRON_BACKEND, NEMOTRON_STREAMING_MODEL
from local_asr_server.transcriber import _transcribe


class NemotronASRTests(unittest.TestCase):
    def test_nemotron_uses_mlx_audio_and_maps_language(self) -> None:
        model = Mock()
        model.stream_generate.return_value = iter([
            types.SimpleNamespace(
                text="Ciao dal modello",
                sentences=[types.SimpleNamespace(text="Ciao dal modello", start=1.25, end=2.5)],
            )
        ])
        stt = types.ModuleType("mlx_audio.stt")
        stt.load = Mock(return_value=model)
        package = types.ModuleType("mlx_audio")

        with patch.dict(sys.modules, {"mlx_audio": package, "mlx_audio.stt": stt}), patch(
            "local_asr_server.transcriber.resolve_model", side_effect=lambda value: value
        ):
            result = _transcribe(
                audio_path="/tmp/audio.wav", model=NEMOTRON_STREAMING_MODEL,
                language="it", task="transcribe", word_timestamps=False,
                initial_prompt=None, temperature=None, condition_on_previous_text=False,
                verbose=None,
            )

        stt.load.assert_called_once_with(NEMOTRON_STREAMING_MODEL)
        model.stream_generate.assert_called_once_with("/tmp/audio.wav", language="it-IT")
        self.assertEqual(result["text"], "Ciao dal modello")
        self.assertEqual(result["segments"], [{"id": 0, "start": 1.25, "end": 2.5, "text": "Ciao dal modello"}])
        self.assertEqual(result["metadata"]["backend"], NEMOTRON_BACKEND)

    def test_nemotron_empty_stream_returns_empty_transcription(self) -> None:
        model = Mock()
        model.stream_generate.return_value = iter([])
        stt = types.ModuleType("mlx_audio.stt")
        stt.load = Mock(return_value=model)
        package = types.ModuleType("mlx_audio")

        with patch.dict(sys.modules, {"mlx_audio": package, "mlx_audio.stt": stt}), patch(
            "local_asr_server.transcriber.resolve_model", side_effect=lambda value: value
        ):
            result = _transcribe(
                audio_path="/tmp/audio.wav", model=NEMOTRON_STREAMING_MODEL,
                language="", task="transcribe", word_timestamps=False,
                initial_prompt=None, temperature=None, condition_on_previous_text=False,
                verbose=None,
            )

        self.assertEqual(result["text"], "")
        self.assertEqual(result["segments"], [])

    def test_nemotron_rejects_translation(self) -> None:
        with self.assertRaisesRegex(ValueError, "transcription only"):
            _transcribe(
                audio_path="/tmp/audio.wav", model=NEMOTRON_STREAMING_MODEL,
                language="it", task="translate", word_timestamps=False,
                initial_prompt=None, temperature=None, condition_on_previous_text=False,
                verbose=None,
            )


if __name__ == "__main__":
    unittest.main()
