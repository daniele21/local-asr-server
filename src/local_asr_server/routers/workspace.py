from __future__ import annotations

from local_asr_server.app_services import get_services

from fastapi import APIRouter, HTTPException, Query, Request

from local_asr_server.recordings import RecordingNotFound
from local_asr_server.routers.helpers import _build_meeting, _build_meetings, _build_projects


router = APIRouter()


@router.get("/v1/projects")
def list_projects(request: Request):
    return _build_projects(request.app)


@router.get("/v1/meetings")
def list_meetings(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    return _build_meetings(request.app, limit=limit)


@router.get("/v1/meetings/{recording_id}")
def get_meeting(recording_id: str, request: Request):
    try:
        recording = get_services(request.app).recordings.get(recording_id)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Meeting not found") from exc
    return _build_meeting(request.app, recording)
