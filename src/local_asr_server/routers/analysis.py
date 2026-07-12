from __future__ import annotations

from local_asr_server.app_services import get_services

from fastapi import APIRouter, HTTPException, Query, Request

from local_asr_server.analysis_templates import list_pipelines, list_templates
from local_asr_server.schemas import AnalysisPipelineRequest, AnalysisRequest
from local_asr_server.services.analysis_service import AnalysisService


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
    run = get_services(request.app).catalog.get_analysis_run(analysis_run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    return run


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
    return {
        "items": get_services(request.app).catalog.list_analysis_runs(
            scope_type=scope_type,
            scope_id=scope_id,
            transcription_id=transcription_id,
            recording_id=recording_id,
            analysis_type=analysis_type,
            pipeline_run_id=pipeline_run_id,
            limit=limit,
        )
    }
