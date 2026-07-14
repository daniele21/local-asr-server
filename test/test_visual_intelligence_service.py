from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from local_asr_server.catalog import CatalogStore
from local_asr_server.recordings import RecordingStore
from local_asr_server.visual_intelligence.fusion import (
    apply_visual_speaker_mapping,
    derive_visual_transcript_links,
)
from local_asr_server.visual_intelligence.inference import (
    VisualResponseValidationError,
    normalize_task_response,
)
from local_asr_server.visual_intelligence.service import PostMeetingVisualService
from local_asr_server.visual_intelligence.contracts import (
    VISUAL_GENERATION_STAGING_DIR,
    VISUAL_PROCESSING_CHECKPOINT,
    VISUAL_RECOVERY_TTL_SECONDS,
    VisualRoutingConfig,
    VisualTask,
    VisualTrigger,
)
from local_asr_server.visual_intelligence.router import (
    TaskAwareFrameRouter,
    evaluate_selection,
    legacy_candidate_sequences,
)
from local_asr_server.visual_intelligence.signatures import (
    calculate_signature,
    participant_tile_changed,
)
from local_asr_server.visual_intelligence.shared_content import (
    normalize_content_type,
    should_infer_shared_candidate,
)
from local_asr_server.visual_intelligence.temporal import aggregate_temporal_state
from visual_intelligence_support import (
    RuntimeStub as _Runtime,
    LegacyClientStub as _Client,
    SequencedClientStub as _SequencedClient,
    TaskAwareClientStub as _TaskAwareClient,
    InvalidMeetingStateClientStub as _InvalidMeetingStateClient,
)


class VisualIntelligenceTests(unittest.TestCase):
    def test_semantic_links_are_derived_and_do_not_mutate_sources(self) -> None:
        temporal = {
            "meeting_state_events": [{
                "timestamp": 2.0, "type": "screen_share_started",
                "observation_id": "state-1",
            }],
            "share_sessions": [{
                "id": "share-01", "keyframes": [{
                    "timestamp": 3.0, "content_type": "slide",
                    "observation_id": "share-1",
                }],
            }],
        }
        segments = [{
            "id": 7, "start": 1.0, "end": 4.0, "text": "Apriamo il piano",
            "provider_speaker": "system:S1",
        }]
        original_temporal = json.loads(json.dumps(temporal))
        original_segments = json.loads(json.dumps(segments))

        links = derive_visual_transcript_links(temporal, segments)

        self.assertEqual(len(links), 2)
        self.assertEqual(links[0]["derivation"], "timestamp_overlap")
        self.assertEqual(links[0]["transcript_evidence"][0]["segment_id"], "7")
        self.assertNotIn("text", links[0]["transcript_evidence"][0])
        self.assertNotIn("provider_speaker", links[0]["transcript_evidence"][0])
        self.assertEqual(temporal, original_temporal)
        self.assertEqual(segments, original_segments)

    def test_shared_content_types_are_normalized_before_adaptive_cadence(self) -> None:
        config = VisualRoutingConfig()
        self.assertEqual(normalize_content_type("presentation"), "slide")
        self.assertEqual(normalize_content_type("sheet"), "spreadsheet")
        self.assertEqual(normalize_content_type("something-new"), "unknown")
        self.assertFalse(should_infer_shared_candidate(
            trigger="heartbeat", timestamp=90.0, last_inference_timestamp=0.0,
            content_type="video", config=config,
        ))
        self.assertTrue(should_infer_shared_candidate(
            trigger="heartbeat", timestamp=120.0, last_inference_timestamp=0.0,
            content_type="video", config=config,
        ))
        self.assertTrue(should_infer_shared_candidate(
            trigger="shared_roi_change", timestamp=1.0, last_inference_timestamp=0.0,
            content_type="video", config=config,
        ))

    def test_shared_content_observation_declares_roi_and_fallback(self) -> None:
        router = TaskAwareFrameRouter(VisualRoutingConfig(
            shared_content_roi=(0.9, 0.1, 0.2, 0.8),
        ))
        candidate = router._candidate(
            {"sequence": 4, "timestamp": 2.0}, VisualTask.SHARED_CONTENT,
            VisualTrigger.FIRST_FRAME, shared=True,
        )
        observation = PostMeetingVisualService._v2_observation(candidate, {
            "content_type": "slide", "title": None, "visible_text": [],
            "key_information": [], "content_state": "stable", "confidence": 0.8,
        }, "qwen")

        self.assertEqual(candidate.roi, (0.0, 0.0, 1.0, 1.0))
        self.assertTrue(observation["roi_fallback"])
        self.assertEqual(observation["roi_source"], "full_frame_fallback")
        self.assertEqual(observation["content_type"], "slide")

    def test_share_session_keeps_supported_stable_content_categories(self) -> None:
        categories = ["slide", "document", "spreadsheet", "code", "browser", "video", "dashboard"]
        observations = [{
            "observation_id": f"share-{index}", "timestamp": float(index),
            "task": "shared_content", "content_type": category,
            "content_state": "stable", "title": category,
        } for index, category in enumerate(categories)]
        observations.append({
            "observation_id": "transition", "timestamp": 10.0,
            "task": "shared_content", "content_type": "slide",
            "content_state": "transitional", "title": "animation",
        })

        sessions = aggregate_temporal_state(observations)["share_sessions"]
        self.assertEqual(len(sessions), 1)
        self.assertEqual(
            [item["content_type"] for item in sessions[0]["keyframes"]], categories,
        )

    def test_meeting_state_events_debounce_oscillation_and_report_observable_transitions(self) -> None:
        def state(timestamp, layout, count, share=False, activity=None):
            return {
                "observation_id": f"state-{timestamp}",
                "timestamp": timestamp,
                "task": "meeting_state",
                "layout": layout,
                "visible_participant_count": count,
                "screen_share": {"active": share, "presenter": "Anna" if share else None},
                "visible_activity": activity or [],
            }

        temporal = aggregate_temporal_state([
            state(0.0, "gallery", 2),
            state(5.0, "speaker", 2),
            state(5.5, "gallery", 2),
            state(10.0, "gallery", 3),
            state(20.0, "presentation", 3, True, ["screen_share"]),
            state(21.0, "presentation", 3, True, ["screen_share"]),
            state(30.0, "gallery", 2),
        ])
        events = temporal["meeting_state_events"]
        event_types = [item["type"] for item in events]

        self.assertEqual(event_types[0], "meeting_state_initialized")
        self.assertNotIn(5.0, [item["timestamp"] for item in events])
        self.assertIn("participant_joined", event_types)
        self.assertIn("participant_left", event_types)
        self.assertIn("screen_share_started", event_types)
        self.assertIn("screen_share_stopped", event_types)
        self.assertEqual(event_types.count("layout_changed"), 2)
        self.assertEqual([item["timestamp"] for item in events], sorted(item["timestamp"] for item in events))

    def test_task_response_contracts_normalize_valid_payloads(self) -> None:
        meeting_ui = normalize_task_response(VisualTask.MEETING_UI, {
            "platform": " meet ", "layout": " gallery ", "participants": [" Anna "],
            "active_speakers": [], "evidence": ["label"], "confidence": 0.8,
        })
        meeting_state = normalize_task_response(VisualTask.MEETING_STATE, {
            "platform": "meet", "layout": "presentation", "visible_participant_count": 3,
            "screen_share": {"active": True, "presenter": " Anna "},
            "visible_activity": [" screen_share "], "confidence": 1,
        })
        shared = normalize_task_response(VisualTask.SHARED_CONTENT, {
            "content_type": "presentation", "title": " Roadmap ",
            "visible_text": [" Q3 "], "key_information": [{"deadline": "July"}],
            "content_state": "STABLE", "confidence": 0.5,
        })

        self.assertEqual(meeting_ui["participants"], ["Anna"])
        self.assertEqual(meeting_state["screen_share"], {"active": True, "presenter": "Anna"})
        self.assertEqual(shared["content_type"], "slide")
        self.assertEqual(shared["key_information"], [{"deadline": "July"}])

    def test_task_response_contracts_reject_invalid_or_partial_payloads(self) -> None:
        invalid = [
            (VisualTask.MEETING_STATE, {
                "platform": "meet", "layout": "gallery", "visible_participant_count": 3,
                "screen_share": {"active": "false", "presenter": None},
                "visible_activity": [], "confidence": 0.8,
            }),
            (VisualTask.MEETING_STATE, {
                "platform": "meet", "layout": "gallery", "visible_participant_count": "3",
                "screen_share": {"active": False, "presenter": None},
                "visible_activity": [], "confidence": 0.8,
            }),
            (VisualTask.SHARED_CONTENT, {
                "content_type": "slide", "title": None, "visible_text": [],
                "key_information": [], "content_state": "invented", "confidence": 0.8,
            }),
            (VisualTask.MEETING_UI, {"platform": "meet", "confidence": 2}),
        ]
        for task, payload in invalid:
            with self.subTest(task=task, payload=payload):
                with self.assertRaises(VisualResponseValidationError):
                    normalize_task_response(task, payload)

    def test_share_sessions_follow_two_observable_start_stop_cycles(self) -> None:
        def state(timestamp, active):
            return {
                "observation_id": f"state-{timestamp}", "timestamp": timestamp,
                "task": "meeting_state", "layout": "presentation" if active else "gallery",
                "visible_participant_count": 2,
                "screen_share": {"active": active, "presenter": "Anna" if active else None},
                "visible_activity": ["screen_share"] if active else [],
            }

        observations = [
            state(0.0, False), state(10.0, True), state(20.0, False),
            state(30.0, True), state(40.0, False),
        ] + [{
            "observation_id": f"share-{timestamp}", "timestamp": timestamp,
            "task": "shared_content", "content_type": "slide",
            "content_state": "stable", "title": f"Slide {timestamp}",
        } for timestamp in (5.0, 12.0, 18.0, 25.0, 32.0, 38.0, 45.0)]

        temporal = aggregate_temporal_state(observations)

        self.assertEqual([item["id"] for item in temporal["share_sessions"]], ["share-01", "share-02"])
        self.assertEqual(
            [[keyframe["timestamp"] for keyframe in item["keyframes"]] for item in temporal["share_sessions"]],
            [[12.0, 18.0], [32.0, 38.0]],
        )
        self.assertEqual(
            [item["timestamp"] for item in temporal["unassigned_share_keyframes"]],
            [5.0, 25.0, 45.0],
        )

    @staticmethod
    def _jpeg(color: str, *, pattern: bool = False) -> bytes:
        from PIL import Image, ImageDraw
        import io

        image = Image.new("RGB", (120, 80), color=color)
        if pattern:
            draw = ImageDraw.Draw(image)
            for x in range(5, 115, 20):
                draw.rectangle([x, 5, x + 9, 75], fill="white")
        output = io.BytesIO()
        image.save(output, format="JPEG")
        return output.getvalue()

    @staticmethod
    def _tile_border_jpeg(border_color: str) -> bytes:
        from PIL import Image, ImageDraw
        import io

        image = Image.new("RGB", (300, 300), color="#202020")
        draw = ImageDraw.Draw(image)
        draw.rectangle([1, 1, 98, 98], outline=border_color, width=8)
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=95)
        return output.getvalue()

    def test_participant_tile_signature_detects_color_only_border_change(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            red = root / "red.jpg"
            green = root / "green.jpg"
            red.write_bytes(self._tile_border_jpeg("#ff0000"))
            green.write_bytes(self._tile_border_jpeg("#008000"))
            left = calculate_signature(red)
            right = calculate_signature(green)

            self.assertTrue(participant_tile_changed(
                left, right, dhash_distance=64, color_threshold=0.02,
            ))

    def test_speaker_selector_adds_local_change_inside_diarization_window(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            frames = []
            for sequence, (timestamp, border) in enumerate((
                (0.0, "#ff0000"),
                (0.6, "#ff0000"),
                (1.5, "#008000"),
                (4.0, "#008000"),
            )):
                path = root / f"{sequence}.jpg"
                path.write_bytes(self._tile_border_jpeg(border))
                frames.append({"sequence": sequence, "timestamp": timestamp, "path": path})
            segments = [{
                "id": 1, "start": 0.0, "end": 3.0, "source": "system",
                "provider_speaker": "system:S1",
            }, {
                "id": 2, "start": 0.0, "end": 2.0, "source": "system",
                "provider_speaker": "system:S2",
            }]
            candidates, _ = TaskAwareFrameRouter(VisualRoutingConfig(mode="shadow")).route(frames, segments)
            speaker_candidates = [item for item in candidates if item.task.value == "meeting_ui"]

            self.assertIn(1, [item.sequence for item in speaker_candidates])
            self.assertIn(2, [item.sequence for item in speaker_candidates])
            self.assertEqual(len({item.sequence for item in speaker_candidates}), len(speaker_candidates))
            self.assertEqual(
                next(item.trigger.value for item in speaker_candidates if item.sequence == 2),
                "local_change",
            )

    def test_task_aware_router_emits_independent_task_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            frames = []
            for sequence, (timestamp, color, pattern) in enumerate((
                (0.0, "black", False),
                (1.0, "black", False),
                (2.0, "blue", True),
                (3.0, "blue", True),
                (9.0, "blue", True),
            )):
                path = root / f"{sequence}.jpg"
                path.write_bytes(self._jpeg(color, pattern=pattern))
                frames.append({"sequence": sequence, "timestamp": timestamp, "path": path})
            segments = [{
                "id": 1, "start": 0.0, "end": 4.0, "source": "system",
                "provider_speaker": "system:S1",
            }]
            candidates, summary = TaskAwareFrameRouter(VisualRoutingConfig(
                mode="shadow",
                speaker_local_window_seconds=0.0,
                speaker_heartbeat_seconds=100.0,
                meeting_state_heartbeat_seconds=100.0,
                shared_content_heartbeat_seconds=100.0,
            )).route(frames, segments)

            self.assertEqual({item.task.value for item in candidates}, {
                "meeting_ui", "meeting_state", "shared_content",
            })
            self.assertEqual(summary["captured_frames"], 5)
            self.assertEqual(summary["candidate_count"], len(candidates))
            self.assertGreaterEqual(summary["candidates_by_trigger"].get("diarization_turn_start", 0), 1)
            ground_truth = json.loads(
                (Path(__file__).parent / "fixtures" / "visual_router_ground_truth.json").read_text(encoding="utf-8")
            )["expected_sequences"]
            actual = {
                task: [item.sequence for item in candidates if item.task.value == task]
                for task in ground_truth
            }
            self.assertEqual(actual, ground_truth)
            self.assertEqual(summary["candidates"], [item.public() for item in candidates])
            task_aware_metrics = evaluate_selection(actual, ground_truth)
            legacy_sequences = legacy_candidate_sequences(frames)
            legacy_metrics = evaluate_selection(
                {task: legacy_sequences for task in ground_truth}, ground_truth,
            )
            self.assertEqual(task_aware_metrics["precision"], 1.0)
            self.assertEqual(task_aware_metrics["recall"], 1.0)
            self.assertGreater(task_aware_metrics["recall"], legacy_metrics["recall"])

    def test_shadow_mode_persists_candidate_detail_without_changing_v1_calls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
            recording = store.create(
                title="Shadow", mime_type="audio/wav", model="test", language="it",
                capture_mode="pc_only", capture_backend="native",
            )
            frame = self._jpeg("blue", pattern=True)
            for sequence, timestamp in enumerate((0.0, 1.0, 2.0)):
                store.stage_visual_frame(recording["id"], sequence, timestamp, frame)
            settings = {
                "visual_intelligence_enabled": True,
                "visual_llm_model": "qwen3-vl-4b",
                "visual_routing_mode": "shadow",
                "visual_minimum_observations": 1,
                "visual_minimum_margin": 0.0,
            }
            client = _Client()
            service = PostMeetingVisualService(client_factory=lambda **_: client)
            with patch("local_asr_server.visual_intelligence.service.load_settings", return_value=settings), \
                 patch.object(service, "_image_message", return_value=[]):
                result = service.process(
                    SimpleNamespace(recordings=store, runtime=_Runtime()), recording["id"],
                    {"segments": [], "stats": {}},
                )

            self.assertEqual(len(client.calls), 1)
            self.assertEqual(result["stats"]["visual_intelligence"]["observation_count"], 3)
            self.assertNotIn("candidates", result["stats"]["visual_intelligence"]["routing_summary"])
            persisted = store.get_visual_intelligence(recording["id"])
            self.assertEqual(persisted["routing"]["routing_mode"], "shadow")
            self.assertEqual(
                len(persisted["routing"]["candidates"]),
                persisted["routing"]["candidate_count"],
            )

            with patch("local_asr_server.visual_intelligence.service.load_settings", return_value={
                **settings, "visual_routing_mode": "v1",
            }), patch.object(service, "_image_message", return_value=[]):
                store.stage_visual_frame(recording["id"], 3, 3.0, frame)
                service.process(
                    SimpleNamespace(recordings=store, runtime=_Runtime()), recording["id"],
                    {"segments": [], "stats": {}},
                )
            self.assertNotIn("routing", store.get_visual_intelligence(recording["id"]))

    def test_v2_processing_persists_temporal_document_and_routing_diagnostics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
            recording = store.create(
                title="Task-aware", mime_type="audio/wav", model="test", language="it",
                capture_mode="pc_only", capture_backend="native",
            )
            for sequence, timestamp in enumerate((0.0, 4.0, 8.0)):
                store.stage_visual_frame(recording["id"], sequence, timestamp, self._jpeg("blue", pattern=True))
            payload = {"segments": [{
                "id": 1, "start": 0.0, "end": 9.0, "text": "Ciao",
                "source": "system", "provider_speaker": "system:S1",
            }], "stats": {}}
            settings = {
                "visual_intelligence_enabled": True,
                "visual_llm_model": "qwen3-vl-4b",
                "visual_routing_mode": "v2",
                "visual_minimum_observations": 1,
                "visual_minimum_margin": 0.0,
                "visual_minimum_distinct_turns": 1,
                "visual_minimum_temporal_support_seconds": 0.0,
            }
            client = _TaskAwareClient()
            service = PostMeetingVisualService(client_factory=lambda **_: client)
            with patch("local_asr_server.visual_intelligence.service.load_settings", return_value=settings), \
                 patch("local_asr_server.visual_intelligence.service.prepare_candidate_message", side_effect=lambda candidate, _: [{"task": candidate.task.value}]):
                result = service.process(SimpleNamespace(recordings=store, runtime=_Runtime()), recording["id"], payload)

            self.assertEqual(result["stats"]["visual_intelligence"]["version"], 2)
            self.assertEqual(result["stats"]["visual_intelligence"]["routing_mode"], "v2")
            persisted = store.get_visual_intelligence(recording["id"])
            self.assertEqual(persisted["document"]["schema_version"], 2)
            self.assertIn("speaker_intervals", persisted["document"])
            self.assertIn("meeting_state_events", persisted["document"])
            self.assertIn("share_sessions", persisted["document"])
            self.assertIn("semantic_links", persisted["document"])
            v2 = store.get_visual_intelligence_v2(recording["id"])
            self.assertEqual(v2["schema_version"], 2)
            self.assertEqual(v2["document"], persisted["document"])
            self.assertEqual(store.list_visual_frames(recording["id"]), [])

    def test_v2_processing_resumes_completed_candidates_after_process_crash(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
            recording = store.create(
                title="Resume", mime_type="audio/wav", model="test", language="it",
                capture_mode="pc_only", capture_backend="native",
            )
            store.stage_visual_frame(recording["id"], 0, 0.0, self._jpeg("blue", pattern=True))
            frames = store.list_visual_frames(recording["id"])
            session_dir = Path(frames[0]["path"]).parent.parent
            config = VisualRoutingConfig(mode="v2")
            candidates, _ = TaskAwareFrameRouter(config).route(frames, [])
            service = PostMeetingVisualService()
            fingerprint = service._processing_fingerprint(candidates, "qwen3-vl-4b")
            store.begin_visual_processing(
                recording["id"], fingerprint, prompt_version=3,
            )
            store.append_visual_observation(recording["id"], {
                "schema_version": 2,
                "observation_id": "visual-0-meeting_ui",
                "sequence": 0,
                "timestamp": 0.0,
                "task": "meeting_ui",
                "trigger": "first_frame",
                "prompt_version": 3,
                "independent_inference": True,
                "active_speakers": [],
                "confidence": 0.0,
            })
            client = _TaskAwareClient()
            service = PostMeetingVisualService(client_factory=lambda **_: client)
            settings = {
                "visual_intelligence_enabled": True,
                "visual_llm_model": "qwen3-vl-4b",
                "visual_routing_mode": "v2",
                "visual_minimum_observations": 1,
                "visual_minimum_margin": 0.0,
                "visual_minimum_distinct_turns": 1,
                "visual_minimum_temporal_support_seconds": 0.0,
            }
            with patch("local_asr_server.visual_intelligence.service.load_settings", return_value=settings), \
                 patch("local_asr_server.visual_intelligence.service.prepare_candidate_message", side_effect=lambda candidate, _: [{"task": candidate.task.value}]):
                result = service.process(
                    SimpleNamespace(recordings=store, runtime=_Runtime()), recording["id"],
                    {"segments": [], "stats": {}},
                )

            self.assertEqual(len(client.calls), 2)
            self.assertEqual(result["stats"]["visual_intelligence"]["resumed_observation_count"], 1)
            self.assertEqual(len(store.get_visual_intelligence_v2(recording["id"])["document"]["observations"]), 3)
            self.assertFalse((session_dir / VISUAL_PROCESSING_CHECKPOINT).exists())
            self.assertEqual(store.list_visual_frames(recording["id"]), [])

    def test_recovery_rejects_invalid_observations_and_expired_staging(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False)
            recording = store.create(
                title="Recovery", mime_type="audio/wav", model="test", language="it",
            )
            store.begin_visual_processing(recording["id"], "fingerprint", prompt_version=3)
            store.append_visual_observation(recording["id"], {
                "schema_version": 2, "observation_id": "wrong-id", "sequence": 0,
                "task": "shared_content", "prompt_version": 3,
            })
            store.append_visual_observation(recording["id"], {
                "schema_version": 2, "observation_id": "visual-1-shared_content", "sequence": 1,
                "task": "shared_content", "prompt_version": 3,
            })

            recovered = store.begin_visual_processing(
                recording["id"], "fingerprint", prompt_version=3,
            )
            self.assertEqual([item["observation_id"] for item in recovered], ["visual-1-shared_content"])

            session_dir = next(root.glob(f"*/{recording['id']}"))
            checkpoint = session_dir / VISUAL_PROCESSING_CHECKPOINT
            old = checkpoint.stat().st_mtime - VISUAL_RECOVERY_TTL_SECONDS - 1
            os.utime(checkpoint, (old, old))
            self.assertEqual(store.cleanup_orphaned_visual_processing(now=checkpoint.stat().st_mtime + VISUAL_RECOVERY_TTL_SECONDS + 1), 1)
            self.assertFalse(checkpoint.exists())

    def test_visual_generation_is_shared_and_partial_promotion_is_hidden(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False)
            recording = store.create(
                title="Generation", mime_type="audio/wav", model="test", language="it",
            )
            store.replace_visual_intelligence_artifacts(
                recording["id"], [], {"version": 2},
                document={"schema_version": 2}, routing={"schema_version": 1},
            )
            coherent = store.get_visual_intelligence(recording["id"])
            generation_id = coherent["summary"]["generation_id"]
            self.assertEqual(coherent["document"]["generation_id"], generation_id)
            self.assertEqual(coherent["routing"]["generation_id"], generation_id)

            real_replace = os.replace
            promoted = 0

            def fail_during_promotion(source, target):
                nonlocal promoted
                if VISUAL_GENERATION_STAGING_DIR in str(source):
                    promoted += 1
                    if promoted == 3:
                        raise OSError("simulated crash")
                return real_replace(source, target)

            with patch("local_asr_server.recordings.os.replace", side_effect=fail_during_promotion):
                with self.assertRaises(OSError):
                    store.replace_visual_intelligence_artifacts(
                        recording["id"], [{"sequence": 1}], {"version": 2},
                        document={"schema_version": 2}, routing={"schema_version": 1},
                    )
            with self.assertRaises(FileNotFoundError):
                store.get_visual_intelligence(recording["id"])

    def test_each_visual_promotion_interruption_keeps_old_or_hidden_generation(self) -> None:
        for fail_at in range(1, 5):
            with self.subTest(fail_at=fail_at), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                store = RecordingStore(root, use_settings_dir=False)
                recording = store.create(
                    title="Promotion", mime_type="audio/wav", model="test", language="it",
                )
                store.replace_visual_intelligence_artifacts(
                    recording["id"], [], {"version": 2},
                    document={"schema_version": 2}, routing={"schema_version": 1},
                )
                old_generation = store.get(recording["id"])["visual_intelligence"]["generation_id"]
                real_replace = os.replace
                promoted = 0

                def interrupt(source, target):
                    nonlocal promoted
                    if VISUAL_GENERATION_STAGING_DIR in str(source):
                        promoted += 1
                        if promoted == fail_at:
                            raise OSError("simulated interruption")
                    return real_replace(source, target)

                with patch("local_asr_server.recordings.os.replace", side_effect=interrupt):
                    with self.assertRaises(OSError):
                        store.replace_visual_intelligence_artifacts(
                            recording["id"], [{"sequence": 1}], {"version": 2},
                            document={"schema_version": 2}, routing={"schema_version": 1},
                        )
                self.assertEqual(
                    store.get(recording["id"])["visual_intelligence"]["generation_id"],
                    old_generation,
                )
                try:
                    visible = store.get_visual_intelligence(recording["id"])
                except FileNotFoundError:
                    continue
                self.assertEqual(visible["summary"]["generation_id"], old_generation)

    def test_v2_persists_candidate_validation_failures_as_degraded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
            recording = store.create(
                title="Validation", mime_type="audio/wav", model="test", language="it",
                capture_mode="pc_only", capture_backend="native",
            )
            store.stage_visual_frame(recording["id"], 0, 0.0, self._jpeg("blue", pattern=True))
            settings = {
                "visual_intelligence_enabled": True, "visual_llm_model": "qwen3-vl-4b",
                "visual_routing_mode": "v2", "visual_minimum_observations": 1,
                "visual_minimum_margin": 0.0,
            }
            service = PostMeetingVisualService(client_factory=lambda **_: _InvalidMeetingStateClient())
            with patch("local_asr_server.visual_intelligence.service.load_settings", return_value=settings), \
                 patch("local_asr_server.visual_intelligence.service.prepare_candidate_message", side_effect=lambda candidate, _: [{"task": candidate.task.value}]):
                result = service.process(
                    SimpleNamespace(recordings=store, runtime=_Runtime()), recording["id"],
                    {"segments": [], "stats": {}},
                )

            summary = result["stats"]["visual_intelligence"]
            document = store.get_visual_intelligence_v2(recording["id"])["document"]
            self.assertEqual(summary["status"], "degraded")
            self.assertEqual(summary["candidate_errors"][0]["task"], "meeting_state")
            self.assertEqual(summary["candidate_errors"][0]["error_type"], "validation")
            self.assertEqual(document["candidate_errors"], summary["candidate_errors"])

    def test_shadow_router_failure_falls_back_to_v1_and_is_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RecordingStore(root, use_settings_dir=False, catalog=CatalogStore(root / "catalog.db"))
            recording = store.create(
                title="Fallback", mime_type="audio/wav", model="test", language="it",
                capture_mode="pc_only", capture_backend="native",
            )
            store.stage_visual_frame(recording["id"], 0, 0.0, b"\xff\xd8\xffnot-a-real-jpeg")
            store.stage_visual_frame(recording["id"], 1, 1.0, b"\xff\xd8\xffstill-not-a-real-jpeg")
            settings = {
                "visual_intelligence_enabled": True,
                "visual_llm_model": "qwen3-vl-4b",
                "visual_routing_mode": "shadow",
                "visual_minimum_observations": 1,
                "visual_minimum_margin": 0.0,
            }
            service = PostMeetingVisualService(client_factory=lambda **_: _Client())
            with patch("local_asr_server.visual_intelligence.service.load_settings", return_value=settings), \
                 patch.object(service, "_image_message", return_value=[]):
                result = service.process(
                    SimpleNamespace(recordings=store, runtime=_Runtime()), recording["id"],
                    {"segments": [], "stats": {}},
                )

            outcome = result["stats"]["visual_intelligence"]
            self.assertEqual(outcome["status"], "degraded")
            self.assertEqual(outcome["requested_routing_mode"], "shadow")
            self.assertEqual(outcome["routing_mode"], "v1")
            self.assertEqual(outcome["fallback_reason"], "task_aware_router_failed")
            self.assertEqual(store.list_visual_frames(recording["id"]), [])

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

    def test_fusion_does_not_count_or_rank_propagated_observations(self) -> None:
        payload = {"segments": [{"id": 1, "start": 0, "end": 5, "text": "Ciao", "provider_speaker": "S1"}]}
        result = apply_visual_speaker_mapping(
            payload,
            [
                {"timestamp": 1, "active_speakers": ["Salvo"], "confidence": 0.9, "independent_inference": True},
                {"timestamp": 2, "active_speakers": ["Andrea"], "confidence": 1.0, "independent_inference": False},
                {"timestamp": 3, "active_speakers": ["Andrea"], "confidence": 1.0, "independent_inference": False},
            ],
            minimum_observations=1,
            minimum_margin=0.0,
        )
        mapping = result["speaker_attribution"]["mappings"][0]
        self.assertEqual(mapping["display_name"], "Salvo")
        self.assertEqual(mapping["observation_count"], 1)

    def test_fusion_abstains_for_overlapping_clusters_multiple_names_and_missing_labels(self) -> None:
        overlapping_payload = {"segments": [
            {"id": 1, "start": 0, "end": 3, "text": "A", "source": "system", "provider_speaker": "S1"},
            {"id": 2, "start": 0, "end": 3, "text": "B", "source": "system", "provider_speaker": "S2"},
        ]}
        overlap = apply_visual_speaker_mapping(
            overlapping_payload,
            [{"timestamp": 1, "active_speakers": ["Salvo"], "confidence": 1.0}],
            minimum_observations=1, minimum_margin=0.0,
        )
        self.assertEqual(overlap["speaker_attribution"]["mappings"], [])
        self.assertFalse(any("speaker_name" in item for item in overlap["segments"]))

        for names in (["Salvo", "Andrea"], []):
            with self.subTest(names=names):
                result = apply_visual_speaker_mapping(
                    {"segments": [{
                        "id": 1, "start": 0, "end": 3, "text": "A",
                        "source": "system", "provider_speaker": "S1",
                    }]},
                    [{"timestamp": 1, "active_speakers": names, "confidence": 1.0}],
                    minimum_observations=1, minimum_margin=0.0,
                )
                self.assertEqual(result["speaker_attribution"]["mappings"], [])

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
