from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

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
        res = store.append_chunk(
            recording_id,
            sequence,
            content,
            sha256=sha256,
            size=size,
            client_started_at_ms=client_started_at_ms,
            client_chunk_start_ms=client_chunk_start_ms,
            client_chunk_end_ms=client_chunk_end_ms,
        )
        
        return res
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
        res = store.append_track_chunk(
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
        
        return res
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


@router.get("/v1/recordings/active")
def get_active_recording(request: Request):
    active = request.app.state.recording_store.active_recording()
    if not active:
        return {"active": False}
    
    recording_id = active["id"]
    # Check if native capture session is active to fetch volume and real status
    session = request.app.state.capture_manager._sessions.get(recording_id)
    
    mic_db = -120.0
    system_db = -120.0
    warnings = []
    
    if session:
        mic_db = session.last_volume.get("mic", -120.0)
        system_db = session.last_volume.get("system", -120.0)
        warnings = [w.get("message", "") for w in session.warnings]
        
        # Calculate actual bytes written on disk
        bytes_written = 0
        for f_name in ["mic.wav", "system.wav"]:
            p = session.output_dir / f_name
            if p.exists():
                bytes_written += p.stat().st_size
    else:
        bytes_written = active.get("bytes_written", 0)
        
    return {
        "active": True,
        "recording_id": recording_id,
        "title": active.get("title"),
        "capture_backend": active.get("capture_backend"),
        "capture_mode": active.get("capture_mode"),
        "started_at": active.get("created_at"),
        "bytes_written": bytes_written,
        "mic_db": mic_db,
        "system_db": system_db,
        "warnings": warnings,
    }


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


@router.get("/v1/recordings/{recording_id}/intelligence")
def get_recording_intelligence(recording_id: str, request: Request):
    try:
        return request.app.state.recording_store.get_intelligence(recording_id)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Audio intelligence not found") from exc


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


# get_active_recording moved above get_recording to resolve dynamic path parameter resolution issues


@router.post("/v1/recordings/{recording_id}/control/stop", status_code=202)
def control_stop_recording(recording_id: str, request: Request):
    recording = request.app.state.recording_store.get(recording_id, include_result=False)
    backend = recording.get("capture_backend", "browser")
    
    # Check if there is an active native session to be absolutely sure
    if request.app.state.capture_manager._sessions.get(recording_id):
        backend = "native"
        
    if backend == "native":
        from local_asr_server.routers.system import stop_capture
        res = stop_capture(recording_id, request)
        return res
    else:
        res = stop_recording(recording_id, request)
        return {"recording": res}


@router.get("/v1/recordings/{recording_id}/overlay/events")
def overlay_events(recording_id: str, request: Request):
    store = request.app.state.recording_store
    try:
        store.get(recording_id, include_result=False)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc

    def event_stream():
        import json
        import time
        last_sent = None
        while True:
            active = store.active_recording()
            if not active or active.get("id") != recording_id:
                yield f"data: {json.dumps({'active': False})}\n\n"
                return

            session = request.app.state.capture_manager._sessions.get(recording_id)
            
            mic_db = -120.0
            system_db = -120.0
            warnings = []
            
            if session:
                mic_db = session.last_volume.get("mic", -120.0)
                system_db = session.last_volume.get("system", -120.0)
                warnings = [w.get("message", "") for w in session.warnings]
                
                # Check actual bytes written on disk for native capture
                bytes_written = 0
                for f_name in ["mic.wav", "system.wav"]:
                    p = session.output_dir / f_name
                    if p.exists():
                        bytes_written += p.stat().st_size
            else:
                bytes_written = active.get("bytes_written", 0)

            status_payload = {
                "active": True,
                "recording_id": recording_id,
                "title": active.get("title"),
                "capture_backend": active.get("capture_backend"),
                "capture_mode": active.get("capture_mode"),
                "started_at": active.get("created_at"),
                "bytes_written": bytes_written,
                "mic_db": mic_db,
                "system_db": system_db,
                "warnings": warnings,
            }

            if status_payload != last_sent:
                yield f"data: {json.dumps(status_payload)}\n\n"
                last_sent = status_payload

            time.sleep(0.25)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
