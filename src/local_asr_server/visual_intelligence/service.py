from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable

from local_asr_server.settings import load_settings
from local_asr_server.visual_intelligence.contracts import VisualRoutingConfig, VisualTask
from local_asr_server.visual_intelligence.fusion import (
    apply_visual_speaker_mapping,
    derive_visual_transcript_links,
)
from local_asr_server.visual_intelligence.inference import (
    PROMPT_VERSION as TASK_PROMPT_VERSION,
    VisualResponseValidationError,
    normalize_task_response,
    parse_visual_response,
    prepare_candidate_message,
)
from local_asr_server.visual_intelligence.router import TaskAwareFrameRouter
from local_asr_server.visual_intelligence.processors import LegacyVisualProcessor, TaskAwareVisualProcessor
from local_asr_server.visual_intelligence.shared_content import should_infer_shared_candidate
from local_asr_server.visual_intelligence.signatures import calculate_signature
from local_asr_server.visual_intelligence.temporal import aggregate_temporal_state
from local_asr_server.diagnostics import diagnostic

logger = logging.getLogger("uvicorn.error")
PROMPT_VERSION = 1
VISUAL_PROMPT = """Osserva questo frame di una videoconferenza. Usa esclusivamente nomi,
label e indicatori visibili; non dedurre identità dai volti. Restituisci solo JSON valido con:
platform, layout, participants (array), active_speakers (array), evidence (array), confidence (0..1).
Se un dato non è leggibile usa un valore unknown o un array vuoto. Non inventare nomi."""


def calculate_dhash(image_path: Path) -> int:
    """Calculate a 64-bit dHash of the image for similarity checks."""
    return calculate_signature(image_path).global_dhash


class PostMeetingVisualService:
    def __init__(self, client_factory: Callable[..., Any] | None = None) -> None:
        self._client_factory = client_factory

    def process(
        self,
        services: Any,
        recording_id: str,
        payload: dict[str, Any],
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> dict[str, Any]:
        settings = load_settings()
        requested_routing_mode = str(settings.get("visual_routing_mode") or "v1")
        frames = services.recordings.list_visual_frames(recording_id)
        if not frames:
            if settings.get("visual_intelligence_enabled"):
                model = str(settings.get("visual_llm_model") or "qwen3-vl-4b")
                summary = {
                    "version": 1,
                    "status": "degraded",
                    "model": model,
                    "frame_count": 0,
                    "observation_count": 0,
                    "parse_errors": 0,
                    **diagnostic(
                        "visual_intelligence",
                        "degraded",
                        requested_backend=model,
                        fallback_used=True,
                        fallback_reason="no_visual_frames_captured",
                        counts={"frames": 0, "observations": 0, "parse_errors": 0},
                    ),
                }
                services.recordings.replace_visual_intelligence_artifacts(
                    recording_id, [], summary,
                )
                payload.setdefault("stats", {})["visual_intelligence"] = summary
            return payload
        if not settings.get("visual_intelligence_enabled"):
            services.recordings.cleanup_visual_frames(recording_id)
            return payload
        model = str(settings.get("visual_llm_model") or "qwen3-vl-4b")
        routing_mode = requested_routing_mode
        routing_summary = None
        routing_error = None
        routing_artifact = None
        if routing_mode in {"shadow", "v2"}:
            try:
                routing_config = VisualRoutingConfig(mode=routing_mode)
                router = TaskAwareFrameRouter(routing_config)
                candidates, routing_summary = router.route(frames, payload.get("segments") or [])
                routing_artifact = {
                    **routing_summary,
                    "routing_mode": routing_mode,
                    "selector_version": 1,
                }
                if routing_mode == "v2":
                    return self._process_v2(
                        services, recording_id, payload, frames, candidates, routing_summary,
                        model=model, progress_callback=progress_callback, routing_config=routing_config,
                        routing_artifact=routing_artifact,
                    )
            except Exception as exc:
                routing_error = str(exc)
                routing_mode = "v1"
                routing_summary = {"schema_version": 1, "error": routing_error}
                logger.warning("Visual router failed; falling back to v1 for %s: %s", recording_id, exc)
        observations, parse_errors = [], 0
        started = time.perf_counter()
        try:
            services.recordings.reset_visual_observations(recording_id)
            ready = services.runtime.ensure_llm_ready(
                capability="image", reasoning="off",
                overrides={"local_llm_model": model},
            )
            client = self._client(ready["base_url"], model)
            total_frames = len(frames)
            last_hash = None
            last_parsed = None
            for i, frame in enumerate(frames):
                if progress_callback:
                    try:
                        progress_callback(i + 1, total_frames)
                    except Exception as cb_exc:
                        logger.warning("Visual intelligence progress callback failed: %s", cb_exc)
                
                is_duplicate = False
                frame_hash = None
                try:
                    frame_hash = calculate_dhash(Path(frame["path"]))
                    if last_hash is not None:
                        distance = bin(frame_hash ^ last_hash).count("1")
                        if distance <= 2:
                            is_duplicate = True
                except Exception as hash_exc:
                    logger.warning("Failed to calculate dhash for frame %s: %s", frame.get("sequence"), hash_exc)

                if is_duplicate and last_parsed is not None:
                    obs = LegacyVisualProcessor.observation(
                        frame, self._legacy_response(last_parsed), model,
                        independent_inference=False,
                    )
                    observations.append(obs)
                    services.recordings.append_visual_observation(recording_id, obs)
                    continue

                try:
                    raw = client.chat(
                        self._image_message(frame["path"]),
                        temperature=0.0,
                        max_tokens=512,
                    )
                    parsed = parse_visual_response(raw)
                    last_parsed = parsed
                    if frame_hash is not None:
                        last_hash = frame_hash
                    obs = LegacyVisualProcessor.observation(
                        frame, self._legacy_response(parsed), model,
                    )
                    observations.append(obs)
                    services.recordings.append_visual_observation(recording_id, obs)
                except Exception as exc:
                    parse_errors += 1
                    logger.warning("Visual frame %s failed: %s", frame.get("sequence"), exc)
            elapsed = time.perf_counter() - started
            status = "degraded" if routing_error else "completed"
            error = None
            if parse_errors and not observations:
                status = "failed"
                error = "all_visual_frames_failed"
            elif parse_errors:
                status = "degraded"
            summary = {
                "version": 1, "status": status, "model": model,
                "prompt_version": PROMPT_VERSION, "frame_count": len(frames),
                "observation_count": len(observations), "parse_errors": parse_errors,
                "elapsed_seconds": round(elapsed, 3),
                "requested_routing_mode": requested_routing_mode,
                "routing_mode": routing_mode,
                **({"routing_summary": self._compact_routing_summary(routing_summary)} if routing_summary else {}),
                **diagnostic(
                    "visual_intelligence",
                    status,
                    requested_backend=model,
                    actual_backend=model,
                    fallback_used=bool(routing_error),
                    fallback_reason=(
                        "task_aware_router_failed" if routing_error
                        else ("partial_frame_failures" if status == "degraded" else None)
                    ),
                    error=error,
                    counts={
                        "frames": len(frames),
                        "observations": len(observations),
                        "parse_errors": parse_errors,
                    },
                    duration_seconds=elapsed,
                ),
            }
            services.recordings.replace_visual_intelligence_artifacts(
                recording_id, observations, summary,
                routing=routing_artifact if requested_routing_mode == "shadow" and routing_error is None else None,
            )
            payload = apply_visual_speaker_mapping(
                payload, observations,
                minimum_observations=int(settings.get("visual_minimum_observations") or 3),
                minimum_margin=float(settings.get("visual_minimum_margin") or 0.2),
            )
            payload.setdefault("stats", {})["visual_intelligence"] = summary
            return payload
        except Exception as exc:
            logger.warning("Post-meeting visual intelligence failed for %s: %s", recording_id, exc)
            payload.setdefault("stats", {})["visual_intelligence"] = {
                "version": 1,
                "model": model,
                **diagnostic(
                    "visual_intelligence",
                    "failed",
                    requested_backend=model,
                    error=str(exc),
                    duration_seconds=time.perf_counter() - started,
                ),
            }
            return payload
        finally:
            services.recordings.cleanup_visual_frames(recording_id)

    def _process_v2(
        self, services, recording_id, payload, frames, candidates, routing_summary, *, model,
        progress_callback, routing_config, routing_artifact,
    ):
        fingerprint = self._processing_fingerprint(candidates, model)
        observations = services.recordings.begin_visual_processing(
            recording_id, fingerprint, prompt_version=TASK_PROMPT_VERSION,
        )
        resumed_observation_count = len(observations)
        completed_observation_ids = {item.get("observation_id") for item in observations}
        parse_errors = 0
        candidate_errors: list[dict[str, Any]] = []
        started = time.perf_counter()
        skipped_by_cadence = 0
        recovered_by_id = {item["observation_id"]: item for item in observations}
        last_shared_inference_timestamp = None
        last_shared_content_type = "unknown"
        completed = False
        try:
            ready = services.runtime.ensure_llm_ready(
                capability="image", reasoning="off", overrides={"local_llm_model": model},
            )
            client = self._client(ready["base_url"], model)
            frames_by_sequence = {int(item["sequence"]): item for item in frames}
            for index, candidate in enumerate(candidates):
                if progress_callback:
                    try:
                        progress_callback(index + 1, len(candidates))
                    except Exception as cb_exc:
                        logger.warning("Visual intelligence progress callback failed: %s", cb_exc)
                frame = frames_by_sequence[candidate.sequence]
                observation_id = f"visual-{candidate.sequence}-{candidate.task.value}"
                if observation_id in completed_observation_ids:
                    recovered = recovered_by_id[observation_id]
                    if candidate.task is VisualTask.SHARED_CONTENT:
                        last_shared_inference_timestamp = candidate.timestamp
                        last_shared_content_type = str(recovered.get("content_type") or "unknown")
                    continue
                if candidate.task is VisualTask.SHARED_CONTENT and not should_infer_shared_candidate(
                    trigger=candidate.trigger.value,
                    timestamp=candidate.timestamp,
                    last_inference_timestamp=last_shared_inference_timestamp,
                    content_type=last_shared_content_type,
                    config=routing_config,
                ):
                    skipped_by_cadence += 1
                    continue
                try:
                    raw = client.chat(
                        prepare_candidate_message(candidate, Path(frame["path"])),
                        temperature=0.0,
                        max_tokens=768 if candidate.task is VisualTask.SHARED_CONTENT else 512,
                    )
                    parsed = parse_visual_response(raw)
                    normalized = normalize_task_response(candidate.task, parsed)
                    observation = TaskAwareVisualProcessor.observation(candidate, normalized, model)
                    observations.append(observation)
                    services.recordings.append_visual_observation(recording_id, observation)
                    if candidate.task is VisualTask.SHARED_CONTENT:
                        last_shared_inference_timestamp = candidate.timestamp
                        last_shared_content_type = observation["content_type"]
                except Exception as exc:
                    parse_errors += 1
                    candidate_errors.append({
                        "sequence": candidate.sequence,
                        "task": candidate.task.value,
                        "trigger": candidate.trigger.value,
                        "error_type": "validation" if isinstance(exc, VisualResponseValidationError) else "inference",
                        "error": str(exc),
                    })
                    logger.warning(
                        "Visual candidate %s/%s failed: %s",
                        candidate.sequence, candidate.task.value, exc,
                    )
            temporal = aggregate_temporal_state(observations)
            temporal["semantic_links"] = derive_visual_transcript_links(
                temporal, payload.get("segments") or [],
            )
            elapsed = time.perf_counter() - started
            status = "completed" if not parse_errors else ("degraded" if observations else "failed")
            summary = {
                "version": 2,
                "status": status,
                "model": model,
                "prompt_version": TASK_PROMPT_VERSION,
                "routing_mode": "v2",
                "frame_count": len(frames),
                "observation_count": len(observations),
                "independent_observation_count": len(observations),
                "parse_errors": parse_errors,
                "candidate_errors": candidate_errors,
                "resumed_observation_count": resumed_observation_count,
                "skipped_by_content_cadence": skipped_by_cadence,
                "routing_summary": self._compact_routing_summary(routing_summary),
                "elapsed_seconds": round(elapsed, 3),
                **diagnostic(
                    "visual_intelligence", status,
                    requested_backend=model, actual_backend=model,
                    fallback_reason="partial_candidate_failures" if status == "degraded" else None,
                    error="all_visual_candidates_failed" if status == "failed" else None,
                    counts={
                        "frames": len(frames), "candidates": len(candidates),
                        "observations": len(observations), "parse_errors": parse_errors,
                        "skipped_by_content_cadence": skipped_by_cadence,
                        "resumed_observations": resumed_observation_count,
                    },
                    duration_seconds=elapsed,
                ),
            }
            document = {
                "schema_version": 2,
                "observations": observations,
                "candidate_errors": candidate_errors,
                **temporal,
                "routing_summary": self._compact_routing_summary(routing_summary),
                "model": model,
                "prompt_version": TASK_PROMPT_VERSION,
            }
            services.recordings.replace_visual_intelligence_artifacts(
                recording_id, observations, summary, document=document, routing=routing_artifact,
            )
            speaker_observations = [item for item in observations if item.get("task") == VisualTask.MEETING_UI.value]
            settings = load_settings()
            payload = apply_visual_speaker_mapping(
                payload, speaker_observations,
                minimum_observations=int(settings.get("visual_minimum_observations") or 3),
                minimum_margin=float(settings.get("visual_minimum_margin") or 0.2),
                minimum_distinct_turns=int(settings.get("visual_minimum_distinct_turns") or 2),
                minimum_temporal_support_seconds=float(settings.get("visual_minimum_temporal_support_seconds") or 0.0),
            )
            payload["visual_intelligence"] = temporal
            payload.setdefault("stats", {})["visual_intelligence"] = summary
            completed = True
            return payload
        except Exception as exc:
            logger.warning("Task-aware visual intelligence failed for %s: %s", recording_id, exc)
            payload.setdefault("stats", {})["visual_intelligence"] = {
                "version": 2, "routing_mode": "v2", "model": model,
                **diagnostic(
                    "visual_intelligence", "failed", requested_backend=model,
                    error=str(exc), duration_seconds=time.perf_counter() - started,
                ),
            }
            return payload
        finally:
            if completed:
                services.recordings.finish_visual_processing(recording_id)
                services.recordings.cleanup_visual_frames(recording_id)

    @classmethod
    def _v2_observation(cls, candidate, parsed, model):
        return TaskAwareVisualProcessor.observation(candidate, parsed, model)

    @staticmethod
    def _compact_routing_summary(routing_summary):
        if not isinstance(routing_summary, dict):
            return routing_summary
        return {key: value for key, value in routing_summary.items() if key != "candidates"}

    @staticmethod
    def _processing_fingerprint(candidates, model: str) -> str:
        payload = {
            "schema_version": 2,
            "model": model,
            "prompt_version": TASK_PROMPT_VERSION,
            "candidates": [candidate.public() for candidate in candidates],
        }
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def _client(self, base_url: str, model: str) -> Any:
        if self._client_factory:
            return self._client_factory(base_url=base_url, model=model)
        from local_llm_server.client import LocalLLMClient
        return LocalLLMClient(base_url=base_url, model=model)

    @staticmethod
    def _image_message(path: Path) -> list[dict[str, Any]]:
        from local_llm_server.vision import prepare_image_message
        return prepare_image_message(path, VISUAL_PROMPT)

    @staticmethod
    def _parse(raw: str) -> dict[str, Any]:
        return parse_visual_response(raw)

    @classmethod
    def _legacy_response(cls, parsed: dict[str, Any]) -> dict[str, Any]:
        return {
            "platform": str(parsed.get("platform") or "unknown"),
            "layout": str(parsed.get("layout") or "unknown"),
            "participants": cls._strings(parsed.get("participants")),
            "active_speakers": cls._strings(parsed.get("active_speakers")),
            "evidence": cls._strings(parsed.get("evidence")),
            "confidence": cls._confidence(parsed.get("confidence")),
        }

    @staticmethod
    def _strings(value: Any) -> list[str]:
        return [str(item).strip() for item in value if str(item).strip()] if isinstance(value, list) else []

    @staticmethod
    def _confidence(value: Any) -> float:
        try:
            return max(0.0, min(1.0, float(value)))
        except (TypeError, ValueError):
            return 0.0
