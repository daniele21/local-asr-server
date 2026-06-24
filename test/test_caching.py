from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from local_asr_server.catalog import CatalogStore
from local_asr_server.schemas import AnalysisRequest
from local_asr_server.services.analysis_service import AnalysisService
from local_asr_server.transcriber import generate_cache_key
from local_asr_server.routers.transcriptions import _transcribe_audio_file_with_cache


class CachingTests(unittest.TestCase):
    def test_transcription_cache_key_includes_initial_prompt(self) -> None:
        base = {
            "audio_hash": "same-audio",
            "model": "test-model",
            "language": "it",
            "task": "transcribe",
            "word_timestamps": False,
            "temperature": 0.0,
            "condition_on_previous_text": False,
            "vad_guided": False,
            "vad_post_filter": True,
        }
        self.assertNotEqual(
            generate_cache_key(**base, initial_prompt="contesto A"),
            generate_cache_key(**base, initial_prompt="contesto B"),
        )

    def test_text_analysis_reuses_exact_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            app_state = SimpleNamespace(catalog_store=CatalogStore(Path(temp) / "catalog.db"))
            service = AnalysisService(app_state)
            provider = Mock()
            provider.analyze.return_value = {"title": "Cached", "summary": "Result"}
            body = AnalysisRequest(text="Stesso testo", llm_provider="mock")
            settings = {"local_llm_quality_preset": "balanced", "local_llm_json_mode": True}

            first = service._analyze_text(
                body, provider, provider_name="mock", model=None, settings=settings,
                api_key="", temperature=0.0,
            )
            second = service._analyze_text(
                body, provider, provider_name="mock", model=None, settings=settings,
                api_key="", temperature=0.0,
            )

        self.assertEqual(first, second)
        provider.analyze.assert_called_once_with("Stesso testo", prompt=None, temperature=0.0)

    def test_recording_track_reuses_cached_engine_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            audio_path = Path(temp) / "track.wav"
            audio_path.write_bytes(b"same-audio")
            options = {
                "model": "test-model",
                "language": "it",
                "task": "transcribe",
                "word_timestamps": False,
                "initial_prompt": None,
                "temperature": 0.0,
                "condition_on_previous_text": False,
                "verbose": None,
                "vad_guided": False,
                "vad_post_filter": True,
            }
            with patch("local_asr_server.transcriber.CACHE_DIR", Path(temp) / "cache"), patch(
                "local_asr_server.routers.transcriptions._transcribe_file",
                return_value={"text": "Riutilizzato", "segments": []},
            ) as transcribe:
                first = _transcribe_audio_file_with_cache(SimpleNamespace(), audio_path, **options)
                second = _transcribe_audio_file_with_cache(SimpleNamespace(), audio_path, **options)

        self.assertEqual(first, second)
        transcribe.assert_called_once()


if __name__ == "__main__":
    unittest.main()
