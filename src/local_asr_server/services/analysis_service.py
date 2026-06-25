from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from local_asr_server.llm import LLMService
from local_asr_server.runtime.llm_sidecar import LocalLLMSidecarError
from local_asr_server.runtime.models import ANALYSIS_QUALITY_DEFAULTS
from local_asr_server.schemas import AnalysisRequest
from local_asr_server.settings import load_settings

logger = logging.getLogger("uvicorn.error")
ANALYSIS_CACHE_VERSION = "analysis-v1"


class AnalysisService:
    """Application service that owns analysis workflow decisions."""

    def __init__(self, app_state: Any) -> None:
        self.app_state = app_state

    def analyze(self, body: AnalysisRequest) -> dict[str, Any]:
        settings = load_settings()
        provider_name = body.llm_provider or settings.get("llm_provider", "mock")
        api_key = body.gemini_api_key or settings.get("gemini_api_key", "")
        local_llm_url = None
        local_llm_model = None
        temperature = self._resolve_temperature(settings)

        if provider_name in {"nemotron_local", "voxtral_local"}:
            capability = "audio" if provider_name == "voxtral_local" and body.recording_id else "text"
            try:
                runtime_options = self.app_state.runtime_services.ensure_llm_ready(
                    capability=capability,
                    reasoning=settings.get("local_llm_reasoning") or "auto",
                )
                local_llm_url = runtime_options.get("base_url")
                local_llm_model = runtime_options.get("model")
            except LocalLLMSidecarError as exc:
                raise HTTPException(status_code=exc.status, detail={"code": exc.code, "message": str(exc)}) from exc
            except RuntimeError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        provider = LLMService.get_provider(provider_name, api_key, local_llm_url, local_llm_model)

        if provider_name == "voxtral_local" and body.recording_id:
            return self._analyze_audio(
                body, provider, provider_name=provider_name,
                model=local_llm_model, settings=settings,
            )
        return self._analyze_text(
            body, provider, provider_name=provider_name, model=local_llm_model,
            settings=settings, api_key=api_key, temperature=temperature,
        )

    def _resolve_temperature(self, settings: dict[str, Any]) -> float:
        configured = settings.get("local_llm_temperature")
        if configured is not None and configured != "":
            try:
                return float(configured)
            except (TypeError, ValueError):
                pass
        preset = settings.get("local_llm_quality_preset") or "balanced"
        return float(getattr(ANALYSIS_QUALITY_DEFAULTS, preset, ANALYSIS_QUALITY_DEFAULTS.balanced))

    def _analyze_audio(
        self, body: AnalysisRequest, provider: Any, *, provider_name: str,
        model: str | None, settings: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            audio_path = self.app_state.recording_store.audio_path(body.recording_id)
            if not hasattr(provider, "analyze_audio"):
                raise ValueError("Il provider selezionato non supporta l'analisi audio.")
            cache_key = self._cache_key(
                input_hash=self._hash_file(audio_path), provider_name=provider_name,
                model=model, settings=settings, audio_task=body.audio_task,
                question=body.question,
            )
            result = self._get_cached_analysis(cache_key)
            if result is None:
                result = provider.analyze_audio(
                    audio_path=audio_path,
                    task=body.audio_task or "analysis",
                    question=body.question,
                )
                result = self._normalize_result(result)
                self.app_state.catalog_store.save_analysis_cache(cache_key, result)
            else:
                result = self._normalize_result(result)
            if body.transcription_id:
                try:
                    self.app_state.transcription_store.save_analysis(body.transcription_id, result)
                except Exception as exc:
                    logger.error("Errore nel salvataggio dell'analisi audio: %s", exc)
            return result
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    def _analyze_text(
        self, body: AnalysisRequest, provider: Any, *, provider_name: str,
        model: str | None, settings: dict[str, Any], api_key: str,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        text_to_analyze = ""
        if body.transcription_id:
            try:
                trans = self.app_state.transcription_store.get(body.transcription_id)
                text_to_analyze = trans.get("text", "")
            except Exception as exc:
                raise HTTPException(status_code=404, detail="Trascrizione non trovata.") from exc
        elif body.recording_id:
            try:
                trans = self.app_state.transcription_store.find_for_recording(body.recording_id)
                if not trans:
                    raise LookupError("Trascrizione non trovata.")
                text_to_analyze = trans.get("text", "")
            except Exception as exc:
                raise HTTPException(status_code=404, detail="Trascrizione non trovata per questa registrazione.") from exc
        elif body.text:
            text_to_analyze = body.text
        else:
            raise HTTPException(status_code=400, detail="Fornire transcription_id, recording_id o text per l'analisi testuale.")

        if not text_to_analyze.strip():
            raise HTTPException(status_code=400, detail="Il testo da analizzare è vuoto.")

        try:
            cache_key = self._cache_key(
                input_hash=self._hash_text(text_to_analyze), provider_name=provider_name,
                model=model, settings=settings, prompt=body.prompt,
                temperature=temperature, credential=api_key if provider_name == "gemini" else None,
            )
            result = self._get_cached_analysis(cache_key)
            if result is None:
                result = provider.analyze(text_to_analyze, prompt=body.prompt, temperature=temperature)
                result = self._normalize_result(result)
                self.app_state.catalog_store.save_analysis_cache(cache_key, result)
            else:
                result = self._normalize_result(result)
            if body.transcription_id:
                self.app_state.transcription_store.save_analysis(body.transcription_id, result)
            return result
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    def _get_cached_analysis(self, cache_key: str) -> dict[str, Any] | None:
        result = self.app_state.catalog_store.get_analysis_cache(cache_key)
        if result is not None:
            logger.info("[Analysis Cache] Hit for key %s", cache_key[:12])
        return result

    @staticmethod
    def _hash_text(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    @staticmethod
    def _hash_file(path: str | Path) -> str:
        digest = hashlib.sha256()
        with Path(path).open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _cache_key(
        self, *, input_hash: str, provider_name: str, model: str | None,
        settings: dict[str, Any], prompt: str | None = None,
        temperature: float | None = None, audio_task: str | None = None,
        question: str | None = None, credential: str | None = None,
    ) -> str:
        """Hash every input and setting that can change an analysis result."""
        provider_options = {
            "provider": provider_name,
            "model": model or settings.get("local_llm_model") or "",
            "temperature": temperature,
            "quality_preset": settings.get("local_llm_quality_preset") or "balanced",
            "reasoning": settings.get("local_llm_reasoning") or "auto",
            "max_output_tokens": settings.get("local_llm_max_output_tokens"),
            "json_mode": settings.get("local_llm_json_mode", True),
            "backend": settings.get("local_llm_backend") or "",
            "model_path": settings.get("local_llm_model_path") or "",
            "mmproj_path": settings.get("local_llm_mmproj_path") or "",
            "ctx_size": settings.get("local_llm_ctx_size"),
        }
        payload = {
            "version": ANALYSIS_CACHE_VERSION,
            "input_hash": input_hash,
            "prompt": prompt or "",
            "audio_task": audio_task or "",
            "question": question or "",
            "provider_options": provider_options,
            # Hash credentials rather than writing secrets to the local catalog.
            "credential_hash": self._hash_text(credential) if credential else "",
        }
        serialized = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        return self._hash_text(serialized)

    def _normalize_result(self, result: Any) -> dict[str, Any]:
        if isinstance(result, str):
            try:
                parsed = json.loads(result)
                if isinstance(parsed, dict):
                    result = parsed
            except Exception:
                pass

        if isinstance(result, str):
            return {"markdown": result}
        if isinstance(result, dict):
            if "markdown" in result:
                return result
            # Convert structured dict to markdown
            lines = []
            if result.get("title"):
                lines.append(f"# {result['title']}\n")
            if result.get("summary"):
                lines.append(f"## Riassunto\n{result['summary']}\n")
            if result.get("key_points"):
                lines.append("## Punti Chiave")
                for kp in result["key_points"]:
                    lines.append(f"- {kp}")
                lines.append("")
            if result.get("action_items"):
                lines.append("## Prossimi Passi")
                for ai in result["action_items"]:
                    lines.append(f"- {ai}")
                lines.append("")
            
            normalized = result.copy()
            normalized["markdown"] = "\n".join(lines)
            return normalized
        return {"markdown": str(result)}
