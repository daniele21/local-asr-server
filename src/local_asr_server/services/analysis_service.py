from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException

from local_asr_server.llm import LLMService
from local_asr_server.runtime.llm_sidecar import LocalLLMSidecarError
from local_asr_server.runtime.models import ANALYSIS_QUALITY_DEFAULTS
from local_asr_server.schemas import AnalysisRequest
from local_asr_server.settings import load_settings

logger = logging.getLogger("uvicorn.error")


class AnalysisService:
    """Application service that owns analysis workflow decisions."""

    def __init__(self, app_state: Any) -> None:
        self.app_state = app_state

    def analyze(self, body: AnalysisRequest) -> dict[str, Any]:
        settings = load_settings()
        provider_name = body.llm_provider or settings.get("llm_provider", "mock")
        api_key = body.gemini_api_key or settings.get("gemini_api_key", "")
        local_llm_url = None
        temperature = self._resolve_temperature(settings)

        if provider_name in {"nemotron_local", "voxtral_local"}:
            capability = "audio" if provider_name == "voxtral_local" and body.recording_id else "text"
            try:
                runtime_options = self.app_state.runtime_services.ensure_llm_ready(
                    capability=capability,
                    reasoning=settings.get("local_llm_reasoning") or "auto",
                )
                local_llm_url = runtime_options.get("base_url")
            except LocalLLMSidecarError as exc:
                raise HTTPException(status_code=exc.status, detail={"code": exc.code, "message": str(exc)}) from exc
            except RuntimeError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        provider = LLMService.get_provider(provider_name, api_key, local_llm_url)

        if provider_name == "voxtral_local" and body.recording_id:
            return self._analyze_audio(body, provider)
        return self._analyze_text(body, provider, temperature=temperature)

    def _resolve_temperature(self, settings: dict[str, Any]) -> float:
        configured = settings.get("local_llm_temperature")
        if configured is not None and configured != "":
            try:
                return float(configured)
            except (TypeError, ValueError):
                pass
        preset = settings.get("local_llm_quality_preset") or "balanced"
        return float(getattr(ANALYSIS_QUALITY_DEFAULTS, preset, ANALYSIS_QUALITY_DEFAULTS.balanced))

    def _analyze_audio(self, body: AnalysisRequest, provider: Any) -> dict[str, Any]:
        try:
            audio_path = self.app_state.recording_store.audio_path(body.recording_id)
            if not hasattr(provider, "analyze_audio"):
                raise ValueError("Il provider selezionato non supporta l'analisi audio.")
            result = provider.analyze_audio(
                audio_path=audio_path,
                task=body.audio_task or "analysis",
                question=body.question,
            )
            if body.transcription_id:
                try:
                    self.app_state.transcription_store.save_analysis(body.transcription_id, result)
                except Exception as exc:
                    logger.error("Errore nel salvataggio dell'analisi audio: %s", exc)
            return result
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    def _analyze_text(self, body: AnalysisRequest, provider: Any, temperature: float | None = None) -> dict[str, Any]:
        text_to_analyze = ""
        if body.transcription_id:
            try:
                trans = self.app_state.transcription_store.get(body.transcription_id)
                text_to_analyze = trans.get("text", "")
            except Exception as exc:
                raise HTTPException(status_code=404, detail="Trascrizione non trovata.") from exc
        elif body.text:
            text_to_analyze = body.text
        else:
            raise HTTPException(status_code=400, detail="Fornire transcription_id o text per l'analisi testuale.")

        if not text_to_analyze.strip():
            raise HTTPException(status_code=400, detail="Il testo da analizzare è vuoto.")

        try:
            result = provider.analyze(text_to_analyze, prompt=body.prompt, temperature=temperature)
            if body.transcription_id:
                self.app_state.transcription_store.save_analysis(body.transcription_id, result)
            return result
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
