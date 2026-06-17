from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse

from local_asr_server.audio_diagnostics import build_quality_report
from local_asr_server.recordings import (
    RecordingConflict,
    RecordingNotFound,
    RecordingStore,
)
from local_asr_server.schemas import CreateRecordingRequest, UpdateRecordingRequest

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.post("/v1/recordings", status_code=201)
def create_recording(request: Request, body: CreateRecordingRequest):
    store: RecordingStore = request.app.state.recording_store
    try:
        res = store.create(
            title=body.title,
            project_name=body.project_name,
            mime_type=body.mime_type,
            model=body.model or request.app.state.default_model,
            language=body.language,
            capture_mode=body.capture_mode or "legacy_mixed",
            capture_backend=body.capture_backend or "browser",
        )
        request.app.state.is_recording = True
        return res
    except OSError as exc:
        raise HTTPException(status_code=507, detail=str(exc)) from exc


@router.post("/v1/recordings/{recording_id}/chunks")
async def append_recording_chunk(
    recording_id: str,
    request: Request,
    file: UploadFile = File(...),
    sequence: int = Form(...),
    sha256: Optional[str] = Form(None),
    size: Optional[int] = Form(None),
    client_started_at_ms: Optional[float] = Form(None),
    client_chunk_start_ms: Optional[float] = Form(None),
    client_chunk_end_ms: Optional[float] = Form(None),
):
    store: RecordingStore = request.app.state.recording_store
    try:
        content = await file.read()
        return store.append_chunk(
            recording_id,
            sequence,
            content,
            sha256=sha256,
            size=size,
            client_started_at_ms=client_started_at_ms,
            client_chunk_start_ms=client_chunk_start_ms,
            client_chunk_end_ms=client_chunk_end_ms,
        )
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail=str(exc)) from exc


@router.post("/v1/recordings/{recording_id}/tracks/{track_id}/chunks")
async def append_recording_track_chunk(
    recording_id: str,
    track_id: str,
    request: Request,
    file: UploadFile = File(...),
    sequence: int = Form(...),
    sha256: Optional[str] = Form(None),
    size: Optional[int] = Form(None),
    client_started_at_ms: Optional[float] = Form(None),
    client_chunk_start_ms: Optional[float] = Form(None),
    client_chunk_end_ms: Optional[float] = Form(None),
):
    store: RecordingStore = request.app.state.recording_store
    try:
        content = await file.read()
        return store.append_track_chunk(
            recording_id,
            track_id,
            sequence,
            content,
            sha256=sha256,
            size=size,
            client_started_at_ms=client_started_at_ms,
            client_chunk_start_ms=client_chunk_start_ms,
            client_chunk_end_ms=client_chunk_end_ms,
        )
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail=str(exc)) from exc


@router.get("/v1/recordings/{recording_id}/tracks/{track_id}/expected-sequence")
def expected_recording_track_sequence(recording_id: str, track_id: str, request: Request):
    try:
        return request.app.state.recording_store.expected_sequence(recording_id, track_id)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/v1/recordings/{recording_id}/recover")
def recover_recording(recording_id: str, request: Request):
    try:
        return request.app.state.recording_store.recover(recording_id)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/v1/recordings/{recording_id}/discard", status_code=204)
def discard_recording(recording_id: str, request: Request):
    try:
        request.app.state.recording_store.discard(recording_id)
        return Response(status_code=204)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/v1/recordings/{recording_id}/stop", status_code=202)
def stop_recording(recording_id: str, request: Request):
    store: RecordingStore = request.app.state.recording_store
    try:
        metadata, _ = store.finalize(recording_id)
        try:
            report = build_quality_report(store.transcribable_tracks(recording_id))
            metadata = store.save_quality_report(recording_id, report)
        except Exception as exc:
            logger.warning("Failed to build recording quality report: %s", exc)
        return metadata
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail=str(exc)) from exc
    finally:
        request.app.state.is_recording = False


@router.get("/v1/recordings/{recording_id}")
def get_recording(recording_id: str, request: Request):
    try:
        return request.app.state.recording_store.get(recording_id)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc


@router.get("/v1/recordings/{recording_id}/audio")
def get_recording_audio(recording_id: str, request: Request):
    store: RecordingStore = request.app.state.recording_store
    try:
        metadata = store.get(recording_id, include_result=False)
        return FileResponse(
            store.audio_path(recording_id),
            media_type=metadata["mime_type"],
            filename=Path(metadata["audio_file"]).name,
        )
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/v1/recordings/{recording_id}/tracks/{track_id}/audio")
def get_recording_track_audio(recording_id: str, track_id: str, request: Request):
    store: RecordingStore = request.app.state.recording_store
    try:
        metadata = store.get(recording_id, include_result=False)
        track = next((item for item in metadata.get("audio_tracks", []) if item.get("id") == track_id), None)
        if track is None:
            raise RecordingConflict("Recording track not found")
        return FileResponse(
            store.track_audio_path(recording_id, track_id),
            media_type=track.get("mime_type") or metadata["mime_type"],
            filename=Path(track.get("audio_file") or f"{track_id}.webm").name,
        )
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/v1/recordings")
def list_recordings(request: Request, limit: int = 20):
    return {"items": request.app.state.recording_store.list(limit)}


@router.patch("/v1/recordings/{recording_id}")
def update_recording(recording_id: str, request: Request, body: UpdateRecordingRequest):
    store: RecordingStore = request.app.state.recording_store
    try:
        return store.update(
            recording_id,
            title=body.title,
            project_name=body.project_name,
        )
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc


@router.get("/v1/recordings/{recording_id}/project")
def get_recording_project(recording_id: str, request: Request):
    try:
        recording = request.app.state.recording_store.get(recording_id)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    transcription = request.app.state.transcription_store.find_for_recording(recording_id)
    return {
        "recording": recording,
        "transcription": transcription,
        "analysis": transcription.get("analysis") if transcription else None,
    }
