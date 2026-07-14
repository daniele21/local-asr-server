from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from local_asr_server.catalog import CatalogStore
from local_asr_server.recordings import RecordingStore
from local_asr_server.visual_intelligence.fusion import apply_visual_speaker_mapping
from local_asr_server.visual_intelligence.service import PostMeetingVisualService


class _Runtime:
    def ensure_llm_ready(self, **kwargs):
        return {"base_url": "http://127.0.0.1:1235", "model": "qwen3-vl-4b"}


class _Client:
    def __init__(self):
        self.calls = []

    def chat(self, messages, **kwargs):
        self.calls.append({"messages": messages, "kwargs": kwargs})
        return json.dumps({
            "platform": "google_meet", "layout": "gallery",
            "participants": ["Salvo", "Andrea"], "active_speakers": ["Salvo"],
            "evidence": ["highlighted_tile", "visible_name"], "confidence": 0.95,
        })


class _SequencedClient:
    def __init__(self, responses):
        self.responses = iter(responses)

    def chat(self, messages, **kwargs):
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response


class VisualIntelligenceTests(unittest.TestCase):
    def test_enabled_visual_intelligence_without_frames_is_explicitly_degraded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
            recording = store.create(
                title="Call", mime_type="audio/wav", model="test", language="it",
                capture_mode="pc_only", capture_backend="native",
            )
            service = PostMeetingVisualService()
            with patch(
                "local_asr_server.visual_intelligence.service.load_settings",
                return_value={"visual_intelligence_enabled": True, "visual_llm_model": "qwen"},
            ):
                result = service.process(
                    SimpleNamespace(recordings=store, runtime=_Runtime()),
                    recording["id"],
                    {"segments": [], "stats": {}},
                )

            outcome = result["stats"]["visual_intelligence"]
            self.assertEqual(outcome["status"], "degraded")
            self.assertTrue(outcome["fallback_used"])
            self.assertEqual(outcome["fallback_reason"], "no_visual_frames_captured")

    def test_parser_accepts_fenced_json_and_safe_python_literal(self) -> None:
        service = PostMeetingVisualService()
        self.assertEqual(service._parse('```json\n{"active_speakers": ["Anna"]}\n```')["active_speakers"], ["Anna"])
        self.assertEqual(service._parse("Result:\n{'active_speakers': ['Anna']}")["active_speakers"], ["Anna"])
        self.assertEqual(service._parse('{\n {"active_speakers": ["Anna"]}\n')["active_speakers"], ["Anna"])

    def test_visual_mapping_prefers_system_track_over_overlapping_microphone(self) -> None:
        payload = {
            "segments": [
                {"start": 0, "end": 2, "text": "Locale", "source": "mic", "provider_speaker": "mic:0"},
                {"start": 0, "end": 2, "text": "Remoto", "source": "system", "provider_speaker": "system:1"},
            ]
        }
        observations = [{"timestamp": 1, "active_speakers": ["Salvo"], "confidence": 1.0}]
        result = apply_visual_speaker_mapping(
            payload, observations, minimum_observations=1, minimum_margin=0.0
        )
        self.assertNotIn("speaker_name", result["segments"][0])
        self.assertEqual(result["segments"][1]["speaker_name"], "Salvo")

    def test_post_meeting_processing_persists_observations_and_removes_frames(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
            recording = store.create(
                title="Call", mime_type="audio/wav", model="test", language="it",
                capture_mode="pc_only", capture_backend="native",
            )
            for sequence, timestamp in enumerate((1.0, 2.0, 3.0)):
                store.stage_visual_frame(recording["id"], sequence, timestamp, b"\xff\xd8\xffjpeg")
            payload = {
                "segments": [{
                    "id": 0, "start": 0.0, "end": 4.0, "text": "Ciao",
                    "speaker_label": "Computer", "provider_speaker": "S1",
                }],
                "stats": {},
            }
            services = SimpleNamespace(recordings=store, runtime=_Runtime())
            settings = {
                "visual_intelligence_enabled": True, "visual_llm_model": "qwen3-vl-4b",
                "visual_minimum_observations": 3, "visual_minimum_margin": 0.2,
            }
            client = _Client()
            service = PostMeetingVisualService(client_factory=lambda **_: client)
            with patch("local_asr_server.visual_intelligence.service.load_settings", return_value=settings), \
                 patch.object(service, "_image_message", return_value=[]):
                result = service.process(services, recording["id"], payload)

            self.assertEqual(result["segments"][0]["speaker_name"], "Salvo")
            self.assertEqual(len(client.calls), 3)
            self.assertNotIn("response_format", client.calls[0]["kwargs"])
            self.assertIn("Salvo: Ciao", result["text"])
            self.assertEqual(store.list_visual_frames(recording["id"]), [])
            persisted = store.get_visual_intelligence(recording["id"])
            self.assertEqual(persisted["summary"]["observation_count"], 3)
            self.assertEqual(len(persisted["observations"]), 3)
            with store.catalog.connection() as connection:
                row = connection.execute("SELECT * FROM recordings WHERE id = ?", (recording["id"],)).fetchone()
            self.assertEqual(store.catalog.row_to_recording(row)["visual_intelligence"]["status"], "completed")

    def test_fusion_abstains_when_support_is_insufficient(self) -> None:
        payload = {"segments": [{"start": 0, "end": 2, "text": "Ciao", "provider_speaker": "S1"}]}
        result = apply_visual_speaker_mapping(
            payload,
            [{"timestamp": 1, "active_speakers": ["Salvo"], "confidence": 1.0}],
            minimum_observations=3,
            minimum_margin=0.2,
        )
        self.assertNotIn("speaker_name", result["segments"][0])
        self.assertEqual(result["speaker_attribution"]["mappings"][0]["status"], "needs_review")

    def test_visual_outcome_is_degraded_or_failed_when_frames_fail(self) -> None:
        for responses, expected in (
            (["not-json", json.dumps({"active_speakers": [], "confidence": 0.0})], "degraded"),
            (["not-json", RuntimeError("qwen unavailable")], "failed"),
        ):
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
                recording = store.create(
                    title="Call", mime_type="audio/wav", model="test", language="it",
                    capture_mode="pc_only", capture_backend="native",
                )
                for sequence in range(2):
                    store.stage_visual_frame(recording["id"], sequence, float(sequence), b"\xff\xd8\xffjpeg")
                service = PostMeetingVisualService(
                    client_factory=lambda **_: _SequencedClient(responses)
                )
                with patch(
                    "local_asr_server.visual_intelligence.service.load_settings",
                    return_value={"visual_intelligence_enabled": True, "visual_llm_model": "qwen"},
                ), patch.object(service, "_image_message", return_value=[]):
                    result = service.process(
                        SimpleNamespace(recordings=store, runtime=_Runtime()),
                        recording["id"],
                        {"segments": [], "stats": {}},
                    )
                self.assertEqual(result["stats"]["visual_intelligence"]["status"], expected)
                self.assertEqual(store.list_visual_frames(recording["id"]), [])

    def test_frame_deduplication_skips_identical_frames(self) -> None:
        from PIL import Image, ImageDraw
        import io
        
        def make_jpeg(color, with_pattern=False):
            img = Image.new("RGB", (100, 100), color=color)
            if with_pattern:
                draw = ImageDraw.Draw(img)
                draw.rectangle([10, 10, 90, 90], fill="white")
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            return buf.getvalue()

        red_frame = make_jpeg("red", with_pattern=False)
        blue_frame = make_jpeg("blue", with_pattern=True)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
            recording = store.create(
                title="Dedupe Test", mime_type="audio/wav", model="test", language="it",
                capture_mode="pc_only", capture_backend="native",
            )
            store.stage_visual_frame(recording["id"], 0, 1.0, red_frame)
            store.stage_visual_frame(recording["id"], 1, 2.0, red_frame)
            store.stage_visual_frame(recording["id"], 2, 3.0, blue_frame)

            payload = {
                "segments": [{
                    "id": 0, "start": 0.0, "end": 4.0, "text": "Test",
                    "speaker_label": "Computer", "provider_speaker": "S1",
                }],
                "stats": {},
            }
            services = SimpleNamespace(recordings=store, runtime=_Runtime())
            settings = {
                "visual_intelligence_enabled": True, "visual_llm_model": "qwen3-vl-4b",
                "visual_minimum_observations": 3, "visual_minimum_margin": 0.2,
            }
            client = _Client()
            service = PostMeetingVisualService(client_factory=lambda **_: client)
            
            progress_calls = []
            def progress_cb(curr, tot):
                progress_calls.append((curr, tot))

            with patch("local_asr_server.visual_intelligence.service.load_settings", return_value=settings), \
                 patch.object(service, "_image_message", return_value=[]):
                result = service.process(services, recording["id"], payload, progress_callback=progress_cb)

            self.assertEqual(len(client.calls), 2)
            self.assertEqual(progress_calls, [(1, 3), (2, 3), (3, 3)])
            
            persisted = store.get_visual_intelligence(recording["id"])
            self.assertEqual(len(persisted["observations"]), 3)


if __name__ == "__main__":
    unittest.main()
