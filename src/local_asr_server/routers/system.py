from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from local_asr_server.audio_router import AudioRouter
from local_asr_server.settings import load_settings, save_settings
from local_asr_server.llm import LLMService
from local_asr_server.recordings import RecordingConflict, RecordingNotFound
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


@router.get("/health")
def health(request: Request) -> dict:
    status_str = "recording" if request.app.state.is_recording else ("transcribing" if request.app.state.is_transcribing else "idle")
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
            "GET /v1/jobs/{job_id}",
            "GET /v1/recordings/{id}",
            "GET /v1/recordings/{id}/audio",
            "GET /v1/recordings/{id}/project",
            "GET /v1/projects",
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
        request.app.state.is_recording = True
        
        # Initialize/update active recording metadata
        rec_meta = store.get(recording_id, include_result=False)
        request.app.state.active_recording = {
            "recording_id": recording_id,
            "title": rec_meta.get("title") or "Registrazione nativa",
            "capture_backend": "native",
            "capture_mode": body.mode,
            "started_at": time.time(),
            "bytes_written": 0,
            "chunk_count": 0,
            "stopped": False,
        }
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
                    request.app.state.active_recording = None
                    request.app.state.is_recording = False
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
        request.app.state.active_recording = None
        request.app.state.is_recording = False
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
        request.app.state.active_recording = None
        request.app.state.is_recording = False
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
    return load_settings()


@router.get("/v1/stats")
def get_stats(request: Request):
    stats = request.app.state.catalog_store.stats()
    if stats["latest_recording"] is None:
        recordings = request.app.state.recording_store.list(limit=1)
        stats["latest_recording"] = recordings[0] if recordings else None
    return stats


@router.post("/v1/settings")
def update_settings(body: SettingsRequest):
    current = load_settings()
    
    # Validate transcriptions_dir
    trans_path = Path(body.transcriptions_dir).expanduser().resolve()
    try:
        trans_path.mkdir(parents=True, exist_ok=True)
        test_file = trans_path / ".write_test"
        test_file.touch()
        test_file.unlink()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Directory trascrizioni non valida o non scrivibile: {e}")
    current["transcriptions_dir"] = str(trans_path)

    # Validate recordings_dir if provided
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
        
    current["gemini_api_key"] = body.gemini_api_key or ""
    current["llm_provider"] = body.llm_provider or "mock"
    current["local_llm_url"] = body.local_llm_url or ""
    current["default_model"] = body.default_model or ""
    current["default_language"] = body.default_language or "it"
    current["default_task"] = body.default_task or "transcribe"
    current["default_temperature"] = body.default_temperature or ""
    current["default_word_timestamps"] = body.default_word_timestamps if body.default_word_timestamps is not None else False
    current["default_condition_on_previous"] = body.default_condition_on_previous if body.default_condition_on_previous is not None else True
    current["local_llm_model"] = body.local_llm_model or "nemotron-nano-4b"
    current["local_llm_model_path"] = body.local_llm_model_path or ""
    current["local_llm_model_paths"] = body.local_llm_model_paths if body.local_llm_model_paths is not None else current.get("local_llm_model_paths", {})
    save_settings(current)
    return current


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
    settings = load_settings()
    provider_name = body.llm_provider or settings.get("llm_provider", "mock")
    api_key = body.gemini_api_key or settings.get("gemini_api_key", "")
    local_llm_url = settings.get("local_llm_url", "http://127.0.0.1:1235")

    provider = LLMService.get_provider(provider_name, api_key, local_llm_url)

    # Voxtral direct audio analysis
    if provider_name == "voxtral_local" and body.recording_id:
        try:
            audio_path = request.app.state.recording_store.audio_path(body.recording_id)
            # Use getattr to safely call the method only on providers that support it
            if hasattr(provider, "analyze_audio"):
                result = provider.analyze_audio(
                    audio_path=audio_path,
                    task=body.audio_task or "analysis",
                    question=body.question
                )
                if body.transcription_id:
                    try:
                        request.app.state.transcription_store.save_analysis(body.transcription_id, result)
                    except Exception as e:
                        logger.error("Errore nel salvataggio dell'analisi audio: %s", e)
                return result
            else:
                raise ValueError("Il provider selezionato non supporta l'analisi audio.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # Text-based analysis (all other providers, or Voxtral fallback)
    text_to_analyze = ""
    if body.transcription_id:
        try:
            trans = request.app.state.transcription_store.get(body.transcription_id)
            text_to_analyze = trans.get("text", "")
        except Exception:
            raise HTTPException(status_code=404, detail="Trascrizione non trovata.")
    elif body.text:
        text_to_analyze = body.text
    else:
        raise HTTPException(status_code=400, detail="Fornire transcription_id o text per l'analisi testuale.")

    if not text_to_analyze.strip():
        raise HTTPException(status_code=400, detail="Il testo da analizzare è vuoto.")

    try:
        result = provider.analyze(text_to_analyze, prompt=body.prompt)
        if body.transcription_id:
            request.app.state.transcription_store.save_analysis(body.transcription_id, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v1/projects")
def list_projects(request: Request):
    return _build_projects(request.app)
