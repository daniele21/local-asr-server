from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from local_asr_server.audio_router import AudioRouter
from local_asr_server.settings import load_settings, save_settings
from local_asr_server.recordings import RecordingConflict, RecordingNotFound
from local_asr_server.services.analysis_service import AnalysisService
from local_asr_server.schemas import (
    OverlayRequest,
    OverlayResizeRequest,
    CaptureEnsurePermissionsRequest,
    CaptureStartRequest,
    SettingsRequest,
    AnalysisRequest,
)
from local_asr_server.routers.helpers import _build_projects

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


def _field_was_set(body: object, field_name: str) -> bool:
    fields_set = getattr(body, "model_fields_set", None)
    if fields_set is None:
        fields_set = getattr(body, "__fields_set__", set())
    return field_name in fields_set


@router.get("/health")
def health(request: Request) -> dict:
    active_recording = request.app.state.recording_store.active_recording()
    active_jobs = request.app.state.job_store.list_jobs(limit=100)
    transcribing = any(
        job["type"] == "transcription" and job["status"] not in {"completed", "failed", "cancelled", "interrupted"}
        for job in active_jobs
    )
    status_str = "recording" if active_recording else ("transcribing" if transcribing else "idle")
    return {
        "ok": True,
        "server": "local-asr-server",
        "backend": "mlx-whisper",
        "default_model": request.app.state.default_model,
        "status": status_str,
        "endpoints": [
            "POST /v1/audio/transcriptions",
            "POST /v1/audio/transcriptions/path",
            "POST /v1/recordings",
            "POST /v1/recordings/{id}/chunks",
            "POST /v1/recordings/{id}/tracks/{track_id}/chunks",
            "GET /v1/recordings/{id}/tracks/{track_id}/expected-sequence",
            "POST /v1/recordings/{id}/stop",
            "POST /v1/recordings/{id}/recover",
            "POST /v1/recordings/{id}/discard",
            "GET /v1/capture/capabilities",
            "GET /v1/capture/permissions",
            "POST /v1/capture/request-permissions",
            "POST /v1/capture/ensure-permissions",
            "GET /v1/capture/diagnostics",
            "POST /v1/recordings/{id}/capture/start",
            "GET /v1/recordings/{id}/capture/events",
            "POST /v1/recordings/{id}/capture/stop",
            "POST /v1/recordings/{id}/capture/cancel",
            "POST /v1/recordings/{id}/transcription-jobs",
            "POST /v1/analysis-jobs",
            "GET /v1/jobs/{job_id}",
            "GET /v1/analysis-runs/{analysis_run_id}",
            "GET /v1/analysis-runs",
            "GET /v1/recordings/{id}",
            "GET /v1/recordings/{id}/audio",
            "GET /v1/recordings/{id}/project",
            "GET /v1/projects",
            "GET /v1/runtime/status",
            "GET /v1/runtime/services",
            "GET /v1/runtime/services/llm",
            "POST /v1/runtime/services/llm/start",
            "POST /v1/runtime/services/llm/stop",
            "POST /v1/runtime/services/llm/restart",
            "GET /v1/runtime/services/llm/logs",
            "GET /v1/system/audio/status",
            "POST /v1/system/audio/activate",
            "POST /v1/system/audio/restore",
            "GET /health",
        ],
        "recordings": True,
    }


@router.get("/v1/session")
def session(request: Request, response: Response) -> dict:
    if request.app.state.auth_enabled:
        response.set_cookie(
            "closedroom_session",
            request.app.state.api_token,
            httponly=True,
            secure=False,
            samesite="strict",
            max_age=60 * 60 * 24,
        )
    return {
        "auth_enabled": request.app.state.auth_enabled,
        "token": request.app.state.api_token if request.app.state.auth_enabled else None,
    }


@router.get("/v1/system/audio/status")
def audio_status():
    return AudioRouter.get_status()


@router.post("/v1/system/audio/activate")
def activate_audio_route():
    success = AudioRouter.route_to_multi_output()
    status = AudioRouter.get_status()
    return {
        **status,
        "success": success,
        "routing_active": success,
    }


@router.post("/v1/system/audio/restore")
def restore_audio_route():
    success = AudioRouter.restore_original_output()
    return {
        **AudioRouter.get_status(),
        "success": success,
        "routing_active": False,
    }


@router.post("/v1/system/audio-route/test-route")
def test_audio_route():
    return activate_audio_route()


@router.post("/v1/system/audio-route/test-restore")
def test_audio_restore():
    return restore_audio_route()


@router.get("/v1/capture/capabilities")
def capture_capabilities(request: Request):
    native = request.app.state.capture_manager.capabilities()
    return {
        "default_backend": "native" if native.get("available") else "browser",
        "native": native,
        "fallbacks": ["browser_blackhole"],
    }


@router.get("/v1/capture/permissions")
def capture_permissions(request: Request):
    return request.app.state.capture_manager.permissions()


@router.post("/v1/capture/request-permissions")
def request_capture_permissions(request: Request):
    return request.app.state.capture_manager.request_permissions()


@router.post("/v1/capture/ensure-permissions")
def ensure_capture_permissions(request: Request, body: CaptureEnsurePermissionsRequest):
    try:
        return request.app.state.capture_manager.ensure_permissions(body.mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/v1/capture/diagnostics")
def capture_diagnostics(request: Request):
    return request.app.state.capture_manager.diagnostics()


@router.post("/v1/recordings/{recording_id}/capture/start", status_code=202)
def start_capture(recording_id: str, request: Request, body: CaptureStartRequest):
    store = request.app.state.recording_store
    try:
        session_dir = store.session_dir(recording_id)
        result = request.app.state.capture_manager.start(recording_id, session_dir, body.mode)
        store.mark_capture_started(recording_id, backend="native")
        return result
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except (RuntimeError, ValueError, RecordingConflict) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/v1/recordings/{recording_id}/capture/events")
def capture_events(recording_id: str, request: Request):
    store = request.app.state.recording_store
    try:
        store.get(recording_id, include_result=False)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc

    def event_stream():
        while True:
            events = request.app.state.capture_manager.drain_events(recording_id)
            for event in events:
                try:
                    store.mark_capture_event(recording_id, event)
                except Exception:
                    logger.warning("Failed to persist capture event", exc_info=True)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in {"stopped", "error"}:
                    return
            time.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/v1/recordings/{recording_id}/capture/stop", status_code=202)
def stop_capture(recording_id: str, request: Request):
    store = request.app.state.recording_store
    try:
        result = request.app.state.capture_manager.stop(recording_id)
        for event in result.get("events", []):
            try:
                store.mark_capture_event(recording_id, event)
            except Exception:
                logger.warning("Failed to persist capture event", exc_info=True)
        from local_asr_server.audio_diagnostics import build_quality_report
        metadata, _ = store.finalize(recording_id)
        try:
            report = build_quality_report(store.transcribable_tracks(recording_id))
            metadata = store.save_quality_report(recording_id, report)
        except Exception as exc:
            logger.warning("Failed to build recording quality report: %s", exc)
        return {"capture": result, "recording": metadata}
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/v1/recordings/{recording_id}/capture/cancel", status_code=202)
def cancel_capture(recording_id: str, request: Request):
    try:
        result = request.app.state.capture_manager.cancel(recording_id)
        request.app.state.recording_store.discard(recording_id)
        return result
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/v1/models/check-cache")
def check_model_cache(request: Request, model: Optional[str] = None):
    from local_asr_server.transcriber import is_model_cached
    target = model if model else request.app.state.default_model
    return {"model": target, "cached": is_model_cached(target)}


@router.get("/v1/settings")
def get_settings():
    settings = load_settings()
    return {
        **{key: value for key, value in settings.items() if key != "gemini_api_key"},
        "gemini_api_key_configured": bool(settings.get("gemini_api_key")),
    }


@router.get("/v1/stats")
def get_stats(request: Request):
    stats = request.app.state.catalog_store.stats()
    if stats["latest_recording"] is None:
        recordings = request.app.state.recording_store.list(limit=1)
        stats["latest_recording"] = recordings[0] if recordings else None
    return stats


@router.get("/v1/runtime/status")
def runtime_status(request: Request):
    return request.app.state.runtime_services.status()


@router.get("/v1/runtime/services")
def runtime_services(request: Request):
    return request.app.state.runtime_services.status()


@router.get("/v1/runtime/services/llm")
def llm_runtime_status(request: Request):
    return request.app.state.runtime_services.llm_status()


@router.post("/v1/runtime/services/llm/start", status_code=202)
def start_llm_runtime_service(request: Request):
    return request.app.state.runtime_services.start_llm()


@router.post("/v1/runtime/services/llm/stop")
def stop_llm_runtime_service(request: Request):
    return request.app.state.runtime_services.stop_llm()


@router.post("/v1/runtime/services/llm/restart", status_code=202)
def restart_llm_runtime_service(request: Request):
    return request.app.state.runtime_services.restart_llm()


@router.get("/v1/runtime/services/llm/logs")
def llm_runtime_logs(request: Request, tail: int = Query(default=200, ge=1, le=2000)):
    return request.app.state.runtime_services.llm_logs(tail)


@router.post("/v1/settings")
def update_settings(body: SettingsRequest):
    current = load_settings()

    # Validate and apply transcriptions_dir only when provided and non-empty
    if body.transcriptions_dir:
        trans_path = Path(body.transcriptions_dir).expanduser().resolve()
        try:
            trans_path.mkdir(parents=True, exist_ok=True)
            test_file = trans_path / ".write_test"
            test_file.touch()
            test_file.unlink()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Directory trascrizioni non valida o non scrivibile: {e}")
        current["transcriptions_dir"] = str(trans_path)

    # Validate and apply recordings_dir only when provided
    if body.recordings_dir:
        rec_path = Path(body.recordings_dir).expanduser().resolve()
        try:
            rec_path.mkdir(parents=True, exist_ok=True)
            test_file = rec_path / ".write_test"
            test_file.touch()
            test_file.unlink()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Directory audio non valida o non scrivibile: {e}")
        current["recordings_dir"] = str(rec_path)

    # Apply all other optional fields only when explicitly provided (not None)
    if body.gemini_api_key is not None:
        current["gemini_api_key"] = body.gemini_api_key
    if body.llm_provider is not None:
        current["llm_provider"] = body.llm_provider
    if body.local_llm_mode is not None:
        current["local_llm_mode"] = body.local_llm_mode
    if body.local_llm_url is not None:
        current["local_llm_url"] = body.local_llm_url
    if body.default_model is not None:
        current["default_model"] = body.default_model
    if body.default_language is not None:
        current["default_language"] = body.default_language
    if body.default_task is not None:
        current["default_task"] = body.default_task
    if body.default_temperature is not None:
        current["default_temperature"] = body.default_temperature
    if body.default_word_timestamps is not None:
        current["default_word_timestamps"] = body.default_word_timestamps
    if body.default_condition_on_previous is not None:
        current["default_condition_on_previous"] = body.default_condition_on_previous
    if body.local_llm_model is not None:
        current["local_llm_model"] = body.local_llm_model
    if body.local_llm_quality_preset is not None:
        current["local_llm_quality_preset"] = body.local_llm_quality_preset
    if _field_was_set(body, "local_llm_temperature"):
        current["local_llm_temperature"] = body.local_llm_temperature
    if body.local_llm_reasoning is not None:
        current["local_llm_reasoning"] = body.local_llm_reasoning
    if _field_was_set(body, "local_llm_max_output_tokens"):
        current["local_llm_max_output_tokens"] = body.local_llm_max_output_tokens
    if body.local_llm_json_mode is not None:
        current["local_llm_json_mode"] = body.local_llm_json_mode
    if body.local_llm_model_path is not None:
        current["local_llm_model_path"] = body.local_llm_model_path
    if body.local_llm_model_paths is not None:
        current["local_llm_model_paths"] = body.local_llm_model_paths

    try:
        save_settings(current)
    except OSError as exc:
        raise HTTPException(status_code=507, detail="Unable to persist settings") from exc
    return get_settings()


@router.post("/v1/system/window/overlay")
def toggle_overlay_window(request: Request, body: OverlayRequest):
    window_manager = getattr(request.app.state, "window_manager", None)
    if not window_manager:
        return {"success": False, "error": "Native window manager not available"}
        
    from local_asr_server.window import run_on_main_thread
    
    if body.show:
        run_on_main_thread(window_manager.show_overlay)
    else:
        run_on_main_thread(window_manager.hide_overlay)
        
    return {"success": True}


@router.post("/v1/system/window/overlay/resize")
def resize_overlay_window(request: Request, body: OverlayResizeRequest):
    window_manager = getattr(request.app.state, "window_manager", None)
    if not window_manager:
        return {"success": False, "error": "Native window manager not available"}
        
    from local_asr_server.window import run_on_main_thread
    run_on_main_thread(lambda: window_manager.set_overlay_size(body.width, body.height))
    return {"success": True}


@router.post("/v1/system/select-directory")
def select_directory():
    import subprocess
    try:
        script = 'tell application "System Events" to set frontmost of process "Finder" to true\n' \
                 'POSIX path of (choose folder with prompt "Seleziona la cartella di destinazione:")'
        cmd = ["osascript", "-e", script]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            path = result.stdout.strip()
            return {"path": path}
        else:
            return {"path": None, "error": "Selezione annullata o fallita."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'apertura della dialog: {e}")


@router.post("/v1/system/select-file")
def select_file():
    import subprocess
    try:
        # Prompt user to choose a .gguf file
        script = 'tell application "System Events" to set frontmost of process "Finder" to true\n' \
                 'POSIX path of (choose file of type {"gguf"} with prompt "Seleziona il modello GGUF:")'
        cmd = ["osascript", "-e", script]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            path = result.stdout.strip()
            return {"path": path}
        else:
            return {"path": None, "error": "Selezione annullata o fallita."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'apertura della dialog: {e}")


@router.post("/v1/analysis")
def analyze_transcription(request: Request, body: AnalysisRequest):
    return AnalysisService(request.app.state).analyze(body)


@router.post("/v1/analysis-jobs", status_code=202)
def create_analysis_job(request: Request, body: AnalysisRequest):
    return request.app.state.analysis_jobs.create(body)


@router.get("/v1/analysis-runs/{analysis_run_id}")
def get_analysis_run(analysis_run_id: str, request: Request):
    run = request.app.state.catalog_store.get_analysis_run(analysis_run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    return run


@router.get("/v1/analysis-runs")
def list_analysis_runs(
    request: Request,
    scope_type: str | None = Query(default=None),
    scope_id: str | None = Query(default=None),
    transcription_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    return {
        "items": request.app.state.catalog_store.list_analysis_runs(
            scope_type=scope_type,
            scope_id=scope_id,
            transcription_id=transcription_id,
            limit=limit,
        )
    }


@router.get("/v1/projects")
def list_projects(request: Request):
    return _build_projects(request.app)
