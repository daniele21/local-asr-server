from __future__ import annotations

from local_asr_server.app_services import get_services

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable

from local_asr_server.asr_provider import (
    ASR_PROVIDER_LOCAL,
    ASR_PROVIDER_SPEECHMATICS,
    ASRRequest,
    LocalMlxASRProvider,
    asr_backend_for,
    normalize_asr_provider,
    public_asr_metadata,
    public_provider_options,
    speechmatics_options_from_settings,
)
from local_asr_server.audio_intelligence import build_audio_intelligence
from local_asr_server.recordings import RecordingStore
from local_asr_server.routers.helpers import _merge_track_transcriptions
from local_asr_server.runtime.asr_worker import ASRWorkerRunner, InProcessASRWorkerRunner, ASRProcessRunner
from local_asr_server.schemas import TranscribeRecordingRequest
from local_asr_server.settings import load_settings
from local_asr_server.speechmatics_asr import SpeechmaticsBatchASRProvider
from local_asr_server.speaker_diarization import LocalSpeakerDiarizationService
from local_asr_server.transcriber import (
    _clean_nan_values,
    generate_cache_key,
    get_cached_result,
    hash_audio_file,
    save_cached_result,
)
from local_asr_server.transcription_quality import audio_stats, is_near_silent_track
from local_asr_server.visual_intelligence import PostMeetingVisualService
from local_asr_server.diagnostics import attach_diagnostics, diagnostic, log_diagnostic


logger = logging.getLogger("uvicorn.error")

RECORDING_PIPELINE_CACHE_VERSION = 1
RECORDING_PIPELINE_SETTING_KEYS = (
    "speaker_diarization_enabled",
    "speaker_diarization_minimum_overlap",
    "visual_intelligence_enabled",
    "visual_llm_model",
    "visual_routing_mode",
    "visual_minimum_observations",
    "visual_minimum_margin",
    "visual_minimum_distinct_turns",
    "visual_minimum_temporal_support_seconds",
)


class TranscriptionService:
    """Application service boundary for transcription workflows."""

    def __init__(self, runner: ASRWorkerRunner | None = None) -> None:
        self.runner = runner or ASRProcessRunner()
        self.visual = PostMeetingVisualService()
        self.diarization = LocalSpeakerDiarizationService()

    def transcribe_file(self, **kwargs: Any) -> dict[str, Any]:
        provider_name = normalize_asr_provider(kwargs.pop("asr_provider", ASR_PROVIDER_LOCAL))
        request = ASRRequest(
            audio_path=kwargs["audio_path"],
            model=kwargs.get("model") or "",
            language=kwargs.get("language"),
            task=kwargs.get("task", "transcribe"),
            word_timestamps=bool(kwargs.get("word_timestamps", False)),
            initial_prompt=kwargs.get("initial_prompt"),
            temperature=kwargs.get("temperature"),
            condition_on_previous_text=bool(kwargs.get("condition_on_previous_text", False)),
            verbose=kwargs.get("verbose"),
            vad_guided=bool(kwargs.get("vad_guided", False)),
            vad_post_filter=bool(kwargs.get("vad_post_filter", False)),
            provider=provider_name,
            provider_options=kwargs.pop("provider_options", {}) or {},
            job=kwargs.get("job"),
        )
        if provider_name == ASR_PROVIDER_SPEECHMATICS:
            return SpeechmaticsBatchASRProvider().transcribe(request)
        return LocalMlxASRProvider(self.runner).transcribe(request)

    def transcribe_cached(
        self,
        audio_path: Path,
        *,
        engine: Callable[..., dict[str, Any]] | None = None,
        **options: Any,
    ) -> dict[str, Any]:
        """Reuse one deterministic engine cache for every transcription entrypoint."""
        cache_key = self.cache_key(audio_path, **options)
        cached = get_cached_result(cache_key)
        if cached is not None:
            logger.info("[ASR Cache] Hit for %s", audio_path.name)
            return cached
        result = (engine or self.transcribe_file)(audio_path=str(audio_path), **options)
        save_cached_result(cache_key, result)
        return result

    @staticmethod
    def cache_key(audio_path: Path, **options: Any) -> str:
        provider = normalize_asr_provider(options.get("asr_provider"))
        provider_options = public_provider_options(provider, options.get("provider_options"))
        cache_options = {
            name: options[name]
            for name in (
                "model",
                "language",
                "task",
                "word_timestamps",
                "initial_prompt",
                "temperature",
                "condition_on_previous_text",
                "vad_guided",
                "vad_post_filter",
            )
        }
        cache_options.update(
            asr_provider=provider,
            backend=asr_backend_for(provider, options.get("model") or ""),
            provider_options=provider_options,
        )
        return generate_cache_key(audio_hash=hash_audio_file(audio_path), **cache_options)

    @staticmethod
    def resolve_asr(
        settings: dict[str, Any],
        *,
        provider: str | None = None,
        model: str | None = None,
        speechmatics_region: str | None = None,
        speechmatics_model: str | None = None,
        speechmatics_diarization: str | None = None,
    ) -> tuple[str, str, dict[str, Any], dict[str, Any]]:
        selected_provider = normalize_asr_provider(provider or settings.get("asr_provider"))
        if selected_provider == ASR_PROVIDER_SPEECHMATICS:
            private_options = speechmatics_options_from_settings(
                settings,
                model=speechmatics_model,
                region=speechmatics_region,
                diarization=speechmatics_diarization,
            )
            selected_model = private_options["speechmatics_model"]
        else:
            private_options = {}
            selected_model = model or ""
        return (
            selected_provider,
            selected_model or "",
            private_options,
            public_provider_options(selected_provider, private_options),
        )

    @staticmethod
    def backend(provider: str, model: str) -> str:
        return asr_backend_for(provider, model)

    @staticmethod
    def payload_metadata(provider: str, model: str, options: dict[str, Any]) -> dict[str, Any]:
        return public_asr_metadata(provider, model, options)

    def transcribe_recording(
        self,
        app: Any,
        recording_id: str,
        body: TranscribeRecordingRequest,
        job: Any | None = None,
        *,
        engine: Callable[..., dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        settings = load_settings()
        provider, provider_model, provider_options, public_options = self.resolve_asr(
            settings,
            provider=body.asr_provider,
            model=body.model or app.state.default_model,
            speechmatics_region=body.speechmatics_region,
            speechmatics_model=body.speechmatics_model,
            speechmatics_diarization=body.speechmatics_diarization,
        )
        target_model = provider_model or body.model or app.state.default_model
        store: RecordingStore = get_services(app).recordings
        recording = store.get(recording_id, include_result=False)
        track_paths = store.transcribable_tracks(recording_id)

        def job_event(
            status: str,
            step: str,
            progress: int,
            *,
            component_outcome: dict[str, Any] | None = None,
        ) -> None:
            if job is None:
                return
            if hasattr(app.state, "transcription_jobs"):
                get_services(app).transcription_jobs.update_progress(
                    job.id,
                    status,
                    progress,
                    step,
                    message=component_outcome.get("status") if component_outcome else None,
                    event_payload=component_outcome,
                )
                return
            job.status = status
            job.current_step = step
            job.progress = progress
            job.updated_at = time.time()
            job.events.put(job.public())

        job_event("validating_audio", "validating_audio", 10)
        track_results = []
        total_tracks = max(1, len(track_paths))
        for index, (track, audio_path) in enumerate(track_paths):
            if job and job.cancel_requested:
                raise RuntimeError("Transcription job cancelled")
            step = "transcribing_system" if track.get("id") == "system" else "transcribing_mic"
            job_event(step, step, 20 + int(index / total_tracks * 60))
            result = self._skip_near_silent_track(audio_path, track)
            if result is None:
                result = self.transcribe_cached(
                    audio_path,
                    engine=engine,
                    model=target_model,
                    language=body.language,
                    task=body.task,
                    word_timestamps=body.word_timestamps,
                    initial_prompt=body.initial_prompt,
                    temperature=body.temperature,
                    condition_on_previous_text=body.condition_on_previous_text,
                    verbose=body.verbose,
                    vad_guided=body.vad_guided,
                    vad_post_filter=body.vad_post_filter,
                    asr_provider=provider,
                    provider_options=provider_options,
                )
            public_track = next(
                (item for item in recording.get("audio_tracks", []) if item.get("id") == track["id"]),
                track,
            )
            track_results.append({"track": public_track, "result": result})

        cached_pipeline = get_services(app).transcriptions.latest_for_recording(recording_id)
        frames = store.list_visual_frames(recording_id)
        visual_input_fingerprint = self.visual_input_fingerprint(frames)
        if not frames and cached_pipeline is not None:
            visual_input_fingerprint = cached_pipeline.get("stats", {}).get(
                "recording_pipeline_visual_input_fingerprint", visual_input_fingerprint,
            )
        pipeline_cache_key = self.recording_pipeline_cache_key(
            recording_id=recording_id,
            track_results=track_results,
            settings=settings,
            visual_input_fingerprint=visual_input_fingerprint,
        )
        if (
            cached_pipeline is not None
            and cached_pipeline.get("stats", {}).get("recording_pipeline_cache_key")
            == pipeline_cache_key
            and self.recording_pipeline_cache_reusable(cached_pipeline)
        ):
            logger.info("[Recording Pipeline Cache] Hit for %s", recording_id)
            job_event("merging", "merging", 94)
            cached_pipeline["saved_id"] = cached_pipeline["id"]
            cached_pipeline["saved_file_path"] = str(get_services(app).transcriptions.root)
            cached_pipeline.setdefault("stats", {})["recording_pipeline_cache_hit"] = True
            return cached_pipeline

        job_event("diarizing", "diarizing", 82)
        diarization = self.diarization.process(store, recording_id, track_paths, track_results)
        job_event("diarizing", "diarizing", 83, component_outcome=diarization)
        job_event("merging", "merging", 85)
        payload = _merge_track_transcriptions(
            track_results,
            model=target_model,
            language=body.language,
            elapsed=time.perf_counter() - started_at,
            recording_id=recording_id,
            asr_provider=provider,
            backend=self.backend(provider, target_model),
            provider_options=public_options,
        )
        diarization_summary = {
            key: value for key, value in diarization.items() if key != "tracks"
        }
        payload["speaker_diarization"] = diarization_summary
        payload.setdefault("stats", {})["speaker_diarization"] = diarization_summary
        payload["stats"]["recording_pipeline_cache_key"] = pipeline_cache_key
        payload["stats"]["recording_pipeline_visual_input_fingerprint"] = visual_input_fingerprint
        payload["stats"]["recording_pipeline_cache_hit"] = False
        def visual_progress(detail: dict[str, Any]) -> None:
            val = 88
            current = int(detail.get("processed") or 0)
            total = int(detail.get("total") or 0)
            if total > 0:
                val = 88 + int((current / total) * 2)
            job_event(
                "visual_processing", "visual_processing", val,
                component_outcome=detail,
            )

        job_event("visual_processing", "visual_processing", 88)
        payload = self.visual.process(
            get_services(app), recording_id, payload, progress_callback=visual_progress
        )
        visual_outcome = payload.get("stats", {}).get("visual_intelligence")
        if visual_outcome:
            job_event("visual_processing", "visual_processing", 90, component_outcome=visual_outcome)
        if payload.get("speaker_attribution"):
            payload.setdefault("stats", {})["speaker_attribution"] = payload["speaker_attribution"]
        job_event("audio_intelligence", "audio_intelligence", 92)
        payload = self._attach_audio_intelligence(store, recording_id, track_paths, payload)
        audio_outcome = payload.get("stats", {}).get("audio_intelligence")
        if audio_outcome:
            job_event("audio_intelligence", "audio_intelligence", 93, component_outcome=audio_outcome)
        diagnostics = self._collect_diagnostics(track_results, payload)
        for item in diagnostics:
            log_diagnostic(
                logger,
                item,
                recording_id=recording_id,
                job_id=getattr(job, "id", None),
            )
        payload = attach_diagnostics(payload, diagnostics)
        payload = _clean_nan_values(payload)
        job_event("saving", "saving", 95)
        saved_meta = get_services(app).transcriptions.save(
            payload,
            audio_filename=recording.get("title")
            or Path(recording.get("audio_file") or "recording").name,
            recording_id=recording_id,
        )
        payload["saved_id"] = saved_meta["id"]
        payload["saved_file_path"] = str(get_services(app).transcriptions.root)
        return payload

    @staticmethod
    def recording_pipeline_cache_reusable(payload: dict[str, Any]) -> bool:
        """Retry post-ASR enrichments when a prior run retained inputs after backend failure."""
        visual = payload.get("stats", {}).get("visual_intelligence") or {}
        return not bool((visual.get("details") or {}).get("staging_preserved"))

    @staticmethod
    def recording_pipeline_cache_key(
        *,
        recording_id: str,
        track_results: list[dict[str, Any]],
        settings: dict[str, Any],
        visual_input_fingerprint: str,
    ) -> str:
        """Fingerprint every input that affects post-ASR segment organization."""
        material = {
            "version": RECORDING_PIPELINE_CACHE_VERSION,
            "recording_id": recording_id,
            "track_results": track_results,
            "settings": {key: settings.get(key) for key in RECORDING_PIPELINE_SETTING_KEYS},
            "visual_input_fingerprint": visual_input_fingerprint,
        }
        encoded = json.dumps(
            _clean_nan_values(material), sort_keys=True, separators=(",", ":"), ensure_ascii=False,
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    @staticmethod
    def visual_input_fingerprint(frames: list[dict[str, Any]]) -> str:
        visual_inputs = []
        for frame in frames:
            path = Path(frame["path"])
            visual_inputs.append({
                "sequence": int(frame["sequence"]),
                "timestamp": float(frame["timestamp"]),
                "sha256": hash_audio_file(path),
            })
        encoded = json.dumps(
            visual_inputs, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    @staticmethod
    def _skip_near_silent_track(audio_path: Path, track: dict[str, Any]) -> dict[str, Any] | None:
        try:
            from local_asr_server.audio_intelligence.audio_io import load_audio_samples

            stats = audio_stats(load_audio_samples(audio_path))
        except Exception as exc:
            logger.info(
                "[ASR Quality] Cannot inspect track %s; continuing with ASR: %s",
                track.get("id"),
                exc,
            )
            return None
        if not is_near_silent_track(stats):
            return None
        logger.warning(
            "[ASR Quality] Skipping near-silent track %s: rms=%.6f peak=%.6f",
            track.get("id"),
            stats["rms"],
            stats["peak"],
        )
        return {
            "text": "",
            "segments": [],
            "metadata": {
                "skipped": True,
                "skip_reason": "near_silent_track",
                "audio_stats": stats,
            },
        }

    @staticmethod
    def _attach_audio_intelligence(
        store: RecordingStore,
        recording_id: str,
        track_paths: list[tuple[dict[str, Any], Path]],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            intelligence = build_audio_intelligence(track_paths, payload.get("segments", []))
            store.save_intelligence(recording_id, intelligence)
            payload["segments"] = intelligence.get("segments", payload.get("segments", []))
            payload["insight_candidates"] = intelligence.get("insight_candidates", [])
            unavailable_channels = [
                channel
                for channel, details in (intelligence.get("channels") or {}).items()
                if not details.get("available", True)
            ]
            audio_degraded = bool(intelligence.get("fallback_used") or unavailable_channels)
            payload.setdefault("stats", {})["audio_intelligence"] = {
                "enabled": True,
                "version": intelligence.get("version"),
                "backend": intelligence.get("backend"),
                "mode": intelligence.get("mode"),
                "mock_insights": True,
                "speaking_time_pct": intelligence.get("conversation_metrics", {}).get("speaking_time_pct", {}),
                "long_pause_count": len(intelligence.get("conversation_metrics", {}).get("long_pauses", []) or []),
                "overlap_count": len(intelligence.get("conversation_metrics", {}).get("overlaps", []) or []),
                **diagnostic(
                    "audio_intelligence",
                    "degraded" if audio_degraded else "completed",
                    requested_backend=intelligence.get("requested_backend"),
                    actual_backend=intelligence.get("actual_backend"),
                    fallback_used=bool(intelligence.get("fallback_used")),
                    fallback_reason=intelligence.get("fallback_reason")
                    or (f"unavailable_channels: {', '.join(unavailable_channels)}" if unavailable_channels else None),
                    counts={
                        "channels": len(intelligence.get("channels", {})),
                        "unavailable_channels": len(unavailable_channels),
                    },
                ),
            }
        except Exception as exc:
            logger.warning("Audio intelligence failed for recording %s: %s", recording_id, exc)
            payload.setdefault("stats", {})["audio_intelligence"] = {
                "enabled": False,
                **diagnostic(
                    "audio_intelligence",
                    "failed",
                    requested_backend="silero-vad-v4",
                    error=str(exc),
                ),
            }
        return payload

    @staticmethod
    def _collect_diagnostics(
        track_results: list[dict[str, Any]],
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for item in track_results:
            track_id = str(item.get("track", {}).get("id") or "audio")
            metadata = item.get("result", {}).get("metadata", {}) or {}
            if metadata.get("skipped"):
                items.append(
                    diagnostic(
                        f"asr:{track_id}",
                        "skipped",
                        fallback_reason=metadata.get("skip_reason"),
                        counts={"segments": 0},
                    )
                )
            elif metadata.get("vad_fallback") or metadata.get("vad_filter_fallback"):
                items.append(
                    diagnostic(
                        f"asr:{track_id}",
                        "degraded",
                        requested_backend="vad_guided",
                        actual_backend="full_track_asr",
                        fallback_used=True,
                        fallback_reason=metadata.get("vad_fallback_reason")
                        or metadata.get("vad_filter_fallback"),
                        counts={"segments": len(item.get("result", {}).get("segments", []) or [])},
                    )
                )
        stats = payload.get("stats", {}) or {}
        for key in ("speaker_diarization", "visual_intelligence", "audio_intelligence"):
            value = stats.get(key)
            if isinstance(value, dict) and value.get("component"):
                items.append(value)
        return items
