from __future__ import annotations

from local_asr_server.app_services import get_services

from fastapi import APIRouter, HTTPException, Query, Request

from local_asr_server.analysis_templates import list_pipelines, list_templates
from local_asr_server.schemas import AnalysisPipelineRequest, AnalysisRequest
from local_asr_server.services.analysis_service import AnalysisService
from local_asr_server.structured_notes_projection import (
    LEGACY_DEFAULT_ANALYSIS_TYPES,
    expand_analysis_run,
    expand_analysis_runs,
)


router = APIRouter()


@router.post("/v1/analysis")
def analyze_transcription(request: Request, body: AnalysisRequest):
    return AnalysisService(get_services(request.app)).analyze(body)


@router.post("/v1/analysis-jobs", status_code=202)
def create_analysis_job(request: Request, body: AnalysisRequest):
    return get_services(request.app).analysis_jobs.create(body)


@router.post("/v1/analysis-pipelines", status_code=202)
def create_analysis_pipeline(request: Request, body: AnalysisPipelineRequest):
    return get_services(request.app).analysis_jobs.create_pipeline(body)


@router.get("/v1/analysis/templates")
def get_analysis_templates():
    return {"items": list_templates()}


@router.get("/v1/analysis/pipelines")
def get_analysis_pipelines():
    return {"items": list_pipelines()}


@router.get("/v1/analysis-runs/{analysis_run_id}")
def get_analysis_run(analysis_run_id: str, request: Request):
    source_id = analysis_run_id.split("::", 1)[0]
    run = get_services(request.app).catalog.get_analysis_run(source_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    if analysis_run_id == source_id:
        return expand_analysis_run(run)[0]
    projected = next(
        (item for item in expand_analysis_run(run) if item.get("id") == analysis_run_id),
        None,
    )
    if projected is None:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    return projected


@router.get("/v1/analysis-runs")
def list_analysis_runs(
    request: Request,
    scope_type: str | None = Query(default=None),
    scope_id: str | None = Query(default=None),
    transcription_id: str | None = Query(default=None),
    recording_id: str | None = Query(default=None),
    analysis_type: str | None = Query(default=None),
    pipeline_run_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    project_legacy_type = analysis_type in LEGACY_DEFAULT_ANALYSIS_TYPES
    raw_runs = get_services(request.app).catalog.list_analysis_runs(
        scope_type=scope_type,
        scope_id=scope_id,
        transcription_id=transcription_id,
        recording_id=recording_id,
        analysis_type=None if project_legacy_type else analysis_type,
        pipeline_run_id=pipeline_run_id,
        limit=500 if project_legacy_type else limit,
    )
    items = expand_analysis_runs(raw_runs)
    if analysis_type:
        items = [item for item in items if item.get("analysis_type") == analysis_type]
    return {"items": items[:limit]}
