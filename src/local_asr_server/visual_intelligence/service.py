from __future__ import annotations

import ast
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable

from local_asr_server.settings import load_settings
from local_asr_server.visual_intelligence.contracts import VisualObservation
from local_asr_server.visual_intelligence.fusion import apply_visual_speaker_mapping
from local_asr_server.diagnostics import diagnostic

logger = logging.getLogger("uvicorn.error")
PROMPT_VERSION = 1
VISUAL_PROMPT = """Osserva questo frame di una videoconferenza. Usa esclusivamente nomi,
label e indicatori visibili; non dedurre identità dai volti. Restituisci solo JSON valido con:
platform, layout, participants (array), active_speakers (array), evidence (array), confidence (0..1).
Se un dato non è leggibile usa un valore unknown o un array vuoto. Non inventare nomi."""


def calculate_dhash(image_path: Path) -> int:
    """Calculate a 64-bit dHash of the image for similarity checks."""
    from PIL import Image
    with Image.open(image_path) as img:
        resample = getattr(Image, "Resampling", Image).BILINEAR
        img = img.convert("L").resize((9, 8), resample)
        pixels = list(img.getdata())
        difference = []
        for row in range(8):
            for col in range(8):
                pixel_left = pixels[row * 9 + col]
                pixel_right = pixels[row * 9 + col + 1]
                difference.append(pixel_left > pixel_right)
        decimal_value = 0
        for bit in difference:
            decimal_value = (decimal_value << 1) | int(bit)
        return decimal_value


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
                services.recordings.save_visual_intelligence(recording_id, [], summary)
                payload.setdefault("stats", {})["visual_intelligence"] = summary
            return payload
        if not settings.get("visual_intelligence_enabled"):
            services.recordings.cleanup_visual_frames(recording_id)
            return payload
        model = str(settings.get("visual_llm_model") or "qwen3-vl-4b")
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
                    obs = VisualObservation(
                        sequence=int(frame["sequence"]), timestamp=float(frame["timestamp"]),
                        platform=str(last_parsed.get("platform") or "unknown"),
                        layout=str(last_parsed.get("layout") or "unknown"),
                        participants=self._strings(last_parsed.get("participants")),
                        active_speakers=self._strings(last_parsed.get("active_speakers")),
                        evidence=self._strings(last_parsed.get("evidence")),
                        confidence=self._confidence(last_parsed.get("confidence")),
                        model=model, prompt_version=PROMPT_VERSION,
                    ).public()
                    observations.append(obs)
                    services.recordings.append_visual_observation(recording_id, obs)
                    continue

                try:
                    raw = client.chat(
                        self._image_message(frame["path"]),
                        temperature=0.0,
                        max_tokens=512,
                    )
                    parsed = self._parse(raw)
                    last_parsed = parsed
                    if frame_hash is not None:
                        last_hash = frame_hash
                    obs = VisualObservation(
                        sequence=int(frame["sequence"]), timestamp=float(frame["timestamp"]),
                        platform=str(parsed.get("platform") or "unknown"),
                        layout=str(parsed.get("layout") or "unknown"),
                        participants=self._strings(parsed.get("participants")),
                        active_speakers=self._strings(parsed.get("active_speakers")),
                        evidence=self._strings(parsed.get("evidence")),
                        confidence=self._confidence(parsed.get("confidence")),
                        model=model, prompt_version=PROMPT_VERSION,
                    ).public()
                    observations.append(obs)
                    services.recordings.append_visual_observation(recording_id, obs)
                except Exception as exc:
                    parse_errors += 1
                    logger.warning("Visual frame %s failed: %s", frame.get("sequence"), exc)
            elapsed = time.perf_counter() - started
            status = "completed"
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
                **diagnostic(
                    "visual_intelligence",
                    status,
                    requested_backend=model,
                    actual_backend=model,
                    fallback_reason="partial_frame_failures" if status == "degraded" else None,
                    error=error,
                    counts={
                        "frames": len(frames),
                        "observations": len(observations),
                        "parse_errors": parse_errors,
                    },
                    duration_seconds=elapsed,
                ),
            }
            services.recordings.save_visual_intelligence(recording_id, observations, summary)
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
        candidate = raw.strip()
        if candidate.startswith("```"):
            lines = candidate.splitlines()
            candidate = "\n".join(lines[1:-1]).strip() if len(lines) >= 3 else candidate
        start, end = candidate.find("{"), candidate.rfind("}")
        if start >= 0 and end >= start:
            candidate = candidate[start:end + 1]
        candidates = [candidate]
        without_outer_open = candidate[1:].lstrip() if candidate.startswith("{") else candidate
        if without_outer_open.startswith("{"):
            candidates.append(without_outer_open)
        parsed = None
        last_error: Exception | None = None
        for structured in candidates:
            for parser in (json.loads, ast.literal_eval):
                try:
                    parsed = parser(structured)
                    break
                except (json.JSONDecodeError, SyntaxError, ValueError) as exc:
                    last_error = exc
            if parsed is not None:
                break
        if parsed is None and last_error is not None:
            raise last_error
        if not isinstance(parsed, dict):
            raise ValueError("Visual response must be a JSON object")
        return parsed

    @staticmethod
    def _strings(value: Any) -> list[str]:
        return [str(item).strip() for item in value if str(item).strip()] if isinstance(value, list) else []

    @staticmethod
    def _confidence(value: Any) -> float:
        try:
            return max(0.0, min(1.0, float(value)))
        except (TypeError, ValueError):
            return 0.0
