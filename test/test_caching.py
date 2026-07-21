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
from local_asr_server.services.transcription_service import TranscriptionService
from local_asr_server.transcriptions import TranscriptionStore


class CachingTests(unittest.TestCase):
    def test_recording_pipeline_cache_retries_preserved_visual_staging(self) -> None:
        reusable = {"stats": {"visual_intelligence": {"status": "completed"}}}
        retryable = {
            "stats": {
                "visual_intelligence": {
                    "status": "failed",
                    "details": {"staging_preserved": True},
                }
            }
        }

        self.assertTrue(TranscriptionService.recording_pipeline_cache_reusable(reusable))
        self.assertFalse(TranscriptionService.recording_pipeline_cache_reusable(retryable))

    def test_latest_recording_pipeline_reads_complete_persisted_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temp, patch(
            "local_asr_server.transcriptions.load_settings",
            return_value={"transcriptions_dir": temp},
        ):
            store = TranscriptionStore(CatalogStore(Path(temp) / "catalog.db"))
            saved = store.save(
                {
                    "text": "Ciao",
                    "segments": [],
                    "stats": {"recording_pipeline_cache_key": "same-key"},
                    "diagnostics": [{"component": "visual_intelligence"}],
                    "outcome_status": "completed_with_warnings",
                },
                recording_id="recording-1",
            )

            cached = store.latest_for_recording("recording-1")

        self.assertEqual(cached["id"], saved["id"])
        self.assertEqual(cached["stats"]["recording_pipeline_cache_key"], "same-key")
        self.assertEqual(cached["diagnostics"][0]["component"], "visual_intelligence")

    def test_recording_pipeline_cache_key_reuses_identical_inputs(self) -> None:
        track_results = [{"track": {"id": "mic"}, "result": {"text": "Ciao", "segments": []}}]
        settings = {
            "speaker_diarization_enabled": False,
            "visual_intelligence_enabled": False,
        }
        first = TranscriptionService.recording_pipeline_cache_key(
            recording_id="recording-1", track_results=track_results, settings=settings,
            visual_input_fingerprint=TranscriptionService.visual_input_fingerprint([]),
        )
        second = TranscriptionService.recording_pipeline_cache_key(
            recording_id="recording-1", track_results=track_results, settings=dict(settings),
            visual_input_fingerprint=TranscriptionService.visual_input_fingerprint([]),
        )
        changed = TranscriptionService.recording_pipeline_cache_key(
            recording_id="recording-1",
            track_results=track_results,
            settings={**settings, "speaker_diarization_enabled": True},
            visual_input_fingerprint=TranscriptionService.visual_input_fingerprint([]),
        )
        speechmatics = TranscriptionService.recording_pipeline_cache_key(
            recording_id="recording-1",
            track_results=track_results,
            settings=settings,
            visual_input_fingerprint=TranscriptionService.visual_input_fingerprint([]),
            diarization_provider="speechmatics",
            diarization_region="eu",
            diarization_model="standard",
        )

        self.assertEqual(first, second)
        self.assertNotEqual(first, changed)
        self.assertNotEqual(first, speechmatics)

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

    def test_transcription_cache_key_includes_asr_provider_options(self) -> None:
        base = {
            "audio_hash": "same-audio",
            "model": "standard",
            "language": "it",
            "task": "transcribe",
            "word_timestamps": False,
            "initial_prompt": None,
            "temperature": 0.0,
            "condition_on_previous_text": False,
            "vad_guided": False,
            "vad_post_filter": True,
        }
        local_key = generate_cache_key(**base, asr_provider="local", backend="mlx-whisper")
        cloud_key = generate_cache_key(
            **base,
            asr_provider="speechmatics",
            backend="speechmatics-batch",
            provider_options={"region": "eu", "speechmatics_model": "standard", "speechmatics_diarization": "none"},
        )
        diarized_key = generate_cache_key(
            **base,
            asr_provider="speechmatics",
            backend="speechmatics-batch",
            provider_options={"region": "eu", "speechmatics_model": "standard", "speechmatics_diarization": "speaker"},
        )
        self.assertNotEqual(local_key, cloud_key)
        self.assertNotEqual(cloud_key, diarized_key)

    def test_text_analysis_reuses_exact_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            services = SimpleNamespace(catalog=CatalogStore(Path(temp) / "catalog.db"))
            service = AnalysisService(services)
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
