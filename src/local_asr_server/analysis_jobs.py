from __future__ import annotations

import hashlib
import threading
import time
import uuid
from typing import Any

from fastapi import HTTPException

from local_asr_server.analysis_templates import (
    DEFAULT_ANALYSIS_TYPE,
    DEFAULT_TEMPLATE_VERSION,
    get_pipeline,
    get_template,
    template_for_analysis_type,
)
from local_asr_server.jobs import JobStore
from local_asr_server.schemas import AnalysisPipelineRequest, AnalysisRequest
from local_asr_server.services.analysis_service import AnalysisService
from local_asr_server.settings import load_settings

ANALYSIS_JOB_TYPE = "analysis"


class AnalysisJobManager:
    """Runs analysis workflows as persistent jobs backed by JobStore."""

    def __init__(self, app_state: Any, store: JobStore) -> None:
        self._app_state = app_state
        self._store = store

    def create(self, body: AnalysisRequest) -> dict[str, Any]:
        body = self._with_recording_transcription(body)
        body = self._with_template_defaults(body)
        job_id = str(uuid.uuid4())
        run_id = str(uuid.uuid4())
        scope_type, scope_id = self._resolve_scope(body, run_id)
        settings = load_settings()
        provider = body.llm_provider or settings.get("llm_provider", "mock")
        llm_options = self._llm_options(settings)
        payload = self._request_payload(body)
        input_hash = self._input_hash(body, payload)

        self._store.create(
            job_id=job_id,
            job_type=ANALYSIS_JOB_TYPE,
            scope_type=scope_type,
            scope_id=scope_id,
            payload={
                **payload,
                "analysis_run_id": run_id,
                "llm_options": llm_options,
                "input_hash": input_hash,
            },
        )
        self._app_state.catalog_store.create_analysis_run(
            {
                "id": run_id,
                "job_id": job_id,
                "scope_type": scope_type,
                "scope_id": scope_id,
                "transcription_id": body.transcription_id,
                "recording_id": body.recording_id,
                "analysis_type": body.analysis_type or DEFAULT_ANALYSIS_TYPE,
                "template_id": body.template_id,
                "template_version": body.template_version,
                "pipeline_run_id": body.pipeline_run_id,
                "provider": provider,
                "model": settings.get("local_llm_model") or "",
                "temperature": llm_options.get("temperature"),
                "reasoning": llm_options.get("reasoning") or "auto",
                "effective_reasoning": None,
                "show_thinking": llm_options.get("show_thinking", False),
                "max_output_tokens": llm_options.get("max_output_tokens"),
                "json_mode": llm_options.get("json_mode", True),
                "llm_options": llm_options,
                "prompt_version": self._prompt_version(body, provider),
                "input_hash": input_hash,
                "source_ids": body.source_ids,
                "period_start": body.period_start,
                "period_end": body.period_end,
                "status": "queued",
                "created_at": time.time(),
            }
        )

        threading.Thread(target=self._run, args=(job_id, run_id, body), daemon=True).start()
        return {
            "job_id": job_id,
            "analysis_run_id": run_id,
            "status": "queued",
        }

    def create_pipeline(self, body: AnalysisPipelineRequest) -> dict[str, Any]:
        pipeline = get_pipeline(body.pipeline_id)
        pipeline_run_id = str(uuid.uuid4())
        if body.analysis_types:
            templates = [template_for_analysis_type(analysis_type) for analysis_type in body.analysis_types]
        else:
            templates = [get_template(template_id) for template_id in pipeline.template_ids]
        jobs = []
        for template in templates:
            request_body = AnalysisRequest(
                transcription_id=body.transcription_id,
                recording_id=body.recording_id,
                text=body.text,
                llm_provider=body.llm_provider,
                gemini_api_key=body.gemini_api_key,
                analysis_type=template.analysis_type,
                template_id=template.id,
                template_version=template.version,
                pipeline_id=pipeline.id,
                pipeline_run_id=pipeline_run_id,
                source_ids=body.source_ids,
                period_start=body.period_start,
                period_end=body.period_end,
            )
            jobs.append(self.create(request_body))
        return {
            "pipeline_run_id": pipeline_run_id,
            "pipeline_id": pipeline.id,
            "status": "queued",
            "jobs": jobs,
        }

    def _run(self, job_id: str, run_id: str, body: AnalysisRequest) -> None:
        try:
            if self._store.get(job_id) and self._store.get(job_id).get("cancel_requested"):
                self._mark_cancelled(job_id, run_id)
                return
            self._store.update(job_id, status="running", current_step="analysis", progress=10)
            self._app_state.catalog_store.update_analysis_run(run_id, status="running")
            result = AnalysisService(self._app_state).analyze(body)
            if self._store.get(job_id) and self._store.get(job_id).get("cancel_requested"):
                self._mark_cancelled(job_id, run_id)
                return
            self._app_state.catalog_store.update_analysis_run(
                run_id,
                status="completed",
                result=result,
                completed_at=time.time(),
            )
            self._store.update(
                job_id,
                status="completed",
                current_step="completed",
                progress=100,
                result={"analysis_run_id": run_id, "analysis": result},
            )
        except HTTPException as exc:
            self._mark_failed(job_id, run_id, str(exc.detail))
        except Exception as exc:
            self._mark_failed(job_id, run_id, str(exc))

    def _mark_cancelled(self, job_id: str, run_id: str) -> None:
        self._app_state.catalog_store.update_analysis_run(
            run_id,
            status="cancelled",
            completed_at=time.time(),
        )
        self._store.update(job_id, status="cancelled", current_step="cancelled")

    def _mark_failed(self, job_id: str, run_id: str, error: str) -> None:
        error = error[:2000]
        self._app_state.catalog_store.update_analysis_run(
            run_id,
            status="failed",
            error=error,
            completed_at=time.time(),
        )
        self._store.update(job_id, status="failed", current_step="failed", error=error)

    def _resolve_scope(self, body: AnalysisRequest, run_id: str) -> tuple[str, str]:
        if body.transcription_id:
            return "transcription", body.transcription_id
        if body.recording_id:
            return "recording", body.recording_id
        return "inline_text", run_id

    def _request_payload(self, body: AnalysisRequest) -> dict[str, Any]:
        if hasattr(body, "model_dump"):
            return body.model_dump()
        return body.dict()

    def _replace_request(self, body: AnalysisRequest, **updates: Any) -> AnalysisRequest:
        if hasattr(body, "model_copy"):
            return body.model_copy(update=updates)
        return body.copy(update=updates)

    def _with_template_defaults(self, body: AnalysisRequest) -> AnalysisRequest:
        if body.prompt:
            return self._replace_request(
                body,
                analysis_type=body.analysis_type or "custom_question",
                template_id=body.template_id or "custom_question",
                template_version=body.template_version or DEFAULT_TEMPLATE_VERSION,
            )
        template = get_template(body.template_id) if body.template_id else template_for_analysis_type(body.analysis_type)
        prompt = template.prompt
        if body.question:
            prompt = f"{prompt}\n\nDomanda dell'utente: {body.question}"
        return self._replace_request(
            body,
            prompt=prompt,
            analysis_type=template.analysis_type,
            template_id=template.id,
            template_version=template.version,
        )

    def _with_recording_transcription(self, body: AnalysisRequest) -> AnalysisRequest:
        if body.transcription_id or not body.recording_id:
            return body
        try:
            transcription = self._app_state.transcription_store.find_for_recording(body.recording_id)
        except Exception:
            transcription = None
        if not transcription:
            return body
        return self._replace_request(body, transcription_id=transcription.get("id"))

    def _input_hash(self, body: AnalysisRequest, payload: dict[str, Any]) -> str:
        if body.transcription_id:
            try:
                text = self._app_state.transcription_store.get(body.transcription_id).get("text", "")
            except Exception:
                text = body.transcription_id
        elif body.text:
            text = body.text
        elif body.recording_id:
            text = body.recording_id
        else:
            text = repr(payload)
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _llm_options(self, settings: dict[str, Any]) -> dict[str, Any]:
        return {
            "quality_preset": settings.get("local_llm_quality_preset") or "balanced",
            "temperature": settings.get("local_llm_temperature"),
            "reasoning": settings.get("local_llm_reasoning") or "auto",
            "show_thinking": False,
            "max_output_tokens": settings.get("local_llm_max_output_tokens"),
            "json_mode": settings.get("local_llm_json_mode", True),
        }

    def _prompt_version(self, body: AnalysisRequest, provider: str) -> str:
        if body.prompt:
            return f"{body.template_id or 'custom'}_{body.template_version or DEFAULT_TEMPLATE_VERSION}"
        if body.recording_id and provider == "voxtral_local":
            return "voxtral_audio_analysis_v1"
        return "summary_v1"
