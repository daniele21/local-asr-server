from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from local_asr_server.audio_router import AudioRouter
from local_asr_server.analysis_templates import list_pipelines, list_templates
from local_asr_server.settings import load_settings, save_settings
from local_asr_server.prompts import load_prompts, save_prompts
from local_asr_server.recordings import RecordingConflict, RecordingNotFound
from local_asr_server.services.analysis_service import AnalysisService
from local_asr_server.schemas import (
    OverlayRequest,
    OverlayResizeRequest,
    CaptureEnsurePermissionsRequest,
    CaptureStartRequest,
    SettingsRequest,
    AnalysisRequest,
    AnalysisPipelineRequest,
    MockDataRequest,
)
from local_asr_server.routers.helpers import _build_meeting, _build_meetings, _build_projects

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
            "POST /v1/analysis-pipelines",
            "GET /v1/analysis/templates",
            "GET /v1/analysis/pipelines",
            "GET /v1/jobs/{job_id}",
            "GET /v1/analysis-runs/{analysis_run_id}",
            "GET /v1/analysis-runs",
            "GET /v1/meetings",
            "GET /v1/meetings/{recording_id}",
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


@router.get("/v1/prompts")
def get_prompts(request: Request):
    return load_prompts(getattr(request.app.state, "prompts_file", None))


@router.post("/v1/prompts")
def update_prompts(request: Request, body: dict[str, dict[str, str]]):
    try:
        save_prompts(body, getattr(request.app.state, "prompts_file", None))
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio dei prompt: {e}")


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
    if body.local_llm_backend is not None:
        current["local_llm_backend"] = body.local_llm_backend
    if body.local_llm_mmproj_path is not None:
        current["local_llm_mmproj_path"] = body.local_llm_mmproj_path
    if _field_was_set(body, "local_llm_ctx_size"):
        current["local_llm_ctx_size"] = body.local_llm_ctx_size
    if _field_was_set(body, "local_llm_startup_timeout"):
        current["local_llm_startup_timeout"] = body.local_llm_startup_timeout
    if body.local_llm_llama_server_bin is not None:
        current["local_llm_llama_server_bin"] = body.local_llm_llama_server_bin
    if body.meeting_auto_analysis is not None:
        current["meeting_auto_analysis"] = body.meeting_auto_analysis
    if body.meeting_default_pipeline is not None:
        current["meeting_default_pipeline"] = body.meeting_default_pipeline

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


@router.post("/v1/analysis-pipelines", status_code=202)
def create_analysis_pipeline(request: Request, body: AnalysisPipelineRequest):
    return request.app.state.analysis_jobs.create_pipeline(body)


@router.get("/v1/analysis/templates")
def get_analysis_templates():
    return {"items": list_templates()}


@router.get("/v1/analysis/pipelines")
def get_analysis_pipelines():
    return {"items": list_pipelines()}


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
    recording_id: str | None = Query(default=None),
    analysis_type: str | None = Query(default=None),
    pipeline_run_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    return {
        "items": request.app.state.catalog_store.list_analysis_runs(
            scope_type=scope_type,
            scope_id=scope_id,
            transcription_id=transcription_id,
            recording_id=recording_id,
            analysis_type=analysis_type,
            pipeline_run_id=pipeline_run_id,
            limit=limit,
        )
    }


@router.get("/v1/projects")
def list_projects(request: Request):
    return _build_projects(request.app)


@router.get("/v1/meetings")
def list_meetings(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    return _build_meetings(request.app, limit=limit)


@router.get("/v1/meetings/{recording_id}")
def get_meeting(recording_id: str, request: Request):
    try:
        recording = request.app.state.recording_store.get(recording_id)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Meeting not found") from exc
    return _build_meeting(request.app, recording)


@router.post("/v1/system/mock-data")
def populate_mock_data(request: Request, body: MockDataRequest):
    import wave
    import shutil
    from datetime import datetime, timedelta, timezone
    from local_asr_server.settings import load_settings

    lang = body.lang
    settings = load_settings()
    recordings_dir = Path(settings["recordings_dir"]).expanduser().resolve()
    transcriptions_dir = Path(settings["transcriptions_dir"]).expanduser().resolve()
    catalog_store = request.app.state.catalog_store

    # 1. Clean up existing mock records
    with catalog_store.connection() as conn:
        mock_rec_ids = [row["id"] for row in conn.execute("SELECT id FROM recordings WHERE id LIKE 'mock-%'").fetchall()]
        conn.execute("DELETE FROM analysis_runs WHERE id LIKE 'mock-%' OR recording_id LIKE 'mock-%'")
        conn.execute("DELETE FROM transcriptions WHERE id LIKE 'mock-%' OR recording_id LIKE 'mock-%'")
        conn.execute("DELETE FROM recordings WHERE id LIKE 'mock-%'")

    for rec_id in mock_rec_ids:
        for p in recordings_dir.glob(f"*/{rec_id}"):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)

    for p in transcriptions_dir.glob("mock-transcript-*"):
        p.unlink(missing_ok=True)

    # Helper to calculate relative times
    def iso_days_ago(days: int, hour: int, minute: int = 0) -> str:
        now = datetime.now(timezone.utc)
        dt = now - timedelta(days=days)
        dt = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
        return dt.isoformat().replace("+00:00", "Z")

    # Helper to write silent WAV file
    def create_silent_wav(file_path: Path):
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(file_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(8000)
            wav_file.writeframes(b'\x00' * 16000) # 1 second of silence

    # Mock data definitions
    if lang == "it":
        specs = [
            {
                "id": "mock-onboarding-permissions",
                "title": "Product sync - Onboarding e permessi macOS",
                "created_at": iso_days_ago(0, 10, 15),
                "duration": 2780,
                "project_name": "ClosedRoom Beta Launch",
                "text": "Il team conferma che il primo avvio deve spiegare solo cartella, microfono e cattura audio. Luca validara il flusso permessi entro venerdi, Sara chiudera la vista onboarding e Daniele preparera la demo beta.",
                "brief": "Il team ha riallineato il primo avvio: meno configurazione tecnica, permessi macOS guidati e demo pronta per i primi utenti beta.",
                "actions": [
                    { "task": "Validare il flusso permessi macOS con build firmata", "owner": "Luca", "due_date": "Venerdì", "priority": "Alta", "status": "open" },
                    { "task": "Chiudere la vista onboarding con copy non tecnico", "owner": "Sara", "due_date": "Giovedì", "priority": "Alta", "status": "open" },
                    { "task": "Preparare la demo per i primi utenti beta", "owner": "Daniele", "due_date": "Venerdì", "priority": "Media", "status": "open" }
                ],
                "decisions": [
                    { "decision": "La configurazione tecnica resta nascosta dietro dettagli avanzati.", "rationale": "Riduce attrito nel primo avvio." },
                    { "decision": "La modalità demo deve funzionare senza backend e senza dati reali.", "rationale": "Permette test indipendenti." }
                ],
                "risks": [
                    { "risk": "Permessi macOS possono bloccare la prima registrazione.", "severity": "Alta", "next_step": "Preflight guidato prima dello start." }
                ]
            },
            {
                "id": "mock-design-review",
                "title": "Design review - Home e progetto workspace",
                "created_at": iso_days_ago(0, 14, 30),
                "duration": 2140,
                "project_name": "ClosedRoom Beta Launch",
                "text": "La review conferma che Home deve partire da cosa e successo oggi, mentre Progetti deve mostrare stato, azioni, decisioni e rischi. Il tour deve evidenziare aree reali della UI.",
                "brief": "Home e Progetti diventano viste outcome-first: digest, azioni, decisioni e rischi sono piu importanti dei dettagli tecnici.",
                "actions": [
                    { "task": "Aggiungere spotlight sui blocchi reali di Home", "owner": "Sara", "due_date": "Domani", "priority": "Alta", "status": "open" },
                    { "task": "Rivedere gerarchia visuale del pannello Progetti", "owner": "Daniele", "due_date": "Settimana", "priority": "Media", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Il tour guidato parte dalla Home piena, non dalla pagina Trascrizione.", "rationale": "Mostra valore immediato." },
                    { "decision": "Le pagine manuali restano accessibili ma non sono il racconto principale.", "rationale": "Migliora la navigazione." }
                ],
                "risks": [
                    { "risk": "Troppa configurazione tecnica puo ridurre adozione.", "severity": "Media", "next_step": "Mostrare solo cio che serve nel contesto." }
                ]
            },
            {
                "id": "mock-gtm-pricing",
                "title": "Go-to-market - Pricing e target utenti",
                "created_at": iso_days_ago(1, 11, 0),
                "duration": 1980,
                "project_name": "ClosedRoom Beta Launch",
                "text": "Il team decide di posizionare ClosedRoom su founder, consulenti e team prodotto che lavorano con materiale sensibile. La beta resta prevista per luglio.",
                "brief": "Il posizionamento beta punta su privacy locale, meeting intelligence e time saving per team piccoli con materiale sensibile.",
                "actions": [
                    { "task": "Preparare una pagina beta con focus privacy locale", "owner": "Marta", "due_date": "Lunedì", "priority": "Media", "status": "open" },
                    { "task": "Raccogliere dieci profili beta in target", "owner": "Daniele", "due_date": "Fine mese", "priority": "Media", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Il rilascio beta resta previsto per luglio.", "rationale": "Timeline definita per il marketing." },
                    { "decision": "Il messaggio principale sara recuperare decisioni e azioni senza rileggere trascrizioni.", "rationale": "Chiaro pain point dell'utente." }
                ],
                "risks": [
                    { "risk": "Mancano dati realistici per mostrare il valore in demo.", "severity": "Media", "next_step": "Usare scenario beta launch coerente." }
                ]
            },
            {
                "id": "mock-technical-review",
                "title": "Technical review - Nemotron locale e performance",
                "created_at": iso_days_ago(2, 16, 45),
                "duration": 3120,
                "project_name": "", # Senza progetto
                "status": "recorded" # Incomplete, needs transcription
            }
        ]
    else:
        specs = [
            {
                "id": "mock-onboarding-permissions",
                "title": "Product sync - Onboarding and macOS permissions",
                "created_at": iso_days_ago(0, 10, 15),
                "duration": 2780,
                "project_name": "ClosedRoom Beta Launch",
                "text": "The team confirms that the first launch should only explain the folder, microphone, and audio capture. Luca will validate the permissions flow by Friday, Sara will close the onboarding view, and Daniele will prepare the beta demo.",
                "brief": "The team has realigned the first launch: less technical configuration, guided macOS permissions, and demo ready for the first beta users.",
                "actions": [
                    { "task": "Validate macOS permissions flow with signed build", "owner": "Luca", "due_date": "Friday", "priority": "High", "status": "open" },
                    { "task": "Close onboarding view with non-technical copy", "owner": "Sara", "due_date": "Thursday", "priority": "High", "status": "open" },
                    { "task": "Prepare demo for first beta users", "owner": "Daniele", "due_date": "Friday", "priority": "Medium", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Technical configuration remains hidden behind advanced details.", "rationale": "Reduces friction during first launch." },
                    { "decision": "Demo mode must work without backend and without real data.", "rationale": "Allows independent testing." }
                ],
                "risks": [
                    { "risk": "macOS permissions can block the first recording.", "severity": "High", "next_step": "Guided preflight before start." }
                ]
            },
            {
                "id": "mock-design-review",
                "title": "Design review - Home and project workspace",
                "created_at": iso_days_ago(0, 14, 30),
                "duration": 2140,
                "project_name": "ClosedRoom Beta Launch",
                "text": "The review confirms that Home must start with what happened today, while Projects must show status, actions, decisions, and risks. The tour must highlight real areas of the UI.",
                "brief": "Home and Projects become outcome-first views: digest, actions, decisions, and risks are more important than technical details.",
                "actions": [
                    { "task": "Add spotlight on real blocks of Home", "owner": "Sara", "due_date": "Tomorrow", "priority": "High", "status": "open" },
                    { "task": "Review visual hierarchy of the Projects panel", "owner": "Daniele", "due_date": "Week", "priority": "Medium", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Guided tour starts from the filled Home, not from the Transcription page.", "rationale": "Shows immediate value." },
                    { "decision": "Manual pages remain accessible but are not the main narrative.", "rationale": "Improves overall UX." }
                ],
                "risks": [
                    { "risk": "Too much technical configuration can reduce adoption.", "severity": "Medium", "next_step": "Show only what is needed in context." }
                ]
            },
            {
                "id": "mock-gtm-pricing",
                "title": "Go-to-market - Pricing and user target",
                "created_at": iso_days_ago(1, 11, 0),
                "duration": 1980,
                "project_name": "ClosedRoom Beta Launch",
                "text": "The team decides to position ClosedRoom on founders, consultants, and product teams working with sensitive material. The beta remains planned for July.",
                "brief": "Beta positioning focuses on local privacy, meeting intelligence, and time saving for small teams with sensitive material.",
                "actions": [
                    { "task": "Prepare a beta page with focus on local privacy", "owner": "Marta", "due_date": "Monday", "priority": "Medium", "status": "open" },
                    { "task": "Collect ten target beta profiles", "owner": "Daniele", "due_date": "End of month", "priority": "Medium", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Beta release remains scheduled for July.", "rationale": "Clear timeline for marketing strategy." },
                    { "decision": "Main message will be retrieving decisions and actions without rereading transcripts.", "rationale": "Addresses key user pain point." }
                ],
                "risks": [
                    { "risk": "Lack of realistic data to show value in demo.", "severity": "Medium", "next_step": "Use coherent beta launch scenario." }
                ]
            },
            {
                "id": "mock-technical-review",
                "title": "Technical review - Local Nemotron and performance",
                "created_at": iso_days_ago(2, 16, 45),
                "duration": 3120,
                "project_name": "", # Senza progetto
                "status": "recorded" # Incomplete, needs transcription
            }
        ]

    for spec in specs:
        created_date = spec["created_at"].split("T")[0]
        session_dir = recordings_dir / created_date / spec["id"]
        session_dir.mkdir(parents=True, exist_ok=True)

        # Write 1-second silent WAV files for mixed, mic, system
        create_silent_wav(session_dir / "recording.wav")
        create_silent_wav(session_dir / "mic.wav")
        create_silent_wav(session_dir / "system.wav")

        # Audio tracks metadata
        audio_tracks = [
            {
                "id": "mixed",
                "source": "mixed",
                "label": "Mix",
                "mime_type": "audio/wav",
                "extension": ".wav",
                "chunk_count": 1,
                "bytes_written": 16044,
                "primary": True,
                "audio_file": f"{created_date}/{spec['id']}/recording.wav"
            },
            {
                "id": "mic",
                "source": "mic",
                "label": "Microphone" if lang == "en" else "Microfono",
                "mime_type": "audio/wav",
                "extension": ".wav",
                "chunk_count": 1,
                "bytes_written": 16044,
                "primary": False,
                "audio_file": f"{created_date}/{spec['id']}/mic.wav"
            },
            {
                "id": "system",
                "source": "system",
                "label": "Computer" if lang == "en" else "Computer",
                "mime_type": "audio/wav",
                "extension": ".wav",
                "chunk_count": 1,
                "bytes_written": 16044,
                "primary": False,
                "audio_file": f"{created_date}/{spec['id']}/system.wav"
            }
        ]

        # Recording metadata
        rec_meta = {
            "id": spec["id"],
            "title": spec["title"],
            "project_name": spec["project_name"],
            "status": spec.get("status", "completed"),
            "created_at": spec["created_at"],
            "stopped_at": spec["created_at"],
            "completed_at": spec["created_at"],
            "mime_type": "audio/wav",
            "extension": ".wav",
            "chunk_count": 1,
            "bytes_written": 16044 * 3,
            "model": "mlx-community/nemotron-3.5-asr-streaming-0.6b",
            "language": "it" if lang == "it" else "en",
            "error": None,
            "relative_dir": f"{created_date}/{spec['id']}",
            "capture_mode": "both",
            "primary_track_id": "mixed",
            "audio_tracks": audio_tracks,
            "capture_backend": "native",
            "capture_status": "stopped",
            "quality_report": None,
            "warnings": []
        }

        # Write metadata.json for recording
        with open(session_dir / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(rec_meta, f, indent=2, ensure_ascii=False)

        catalog_store.upsert_recording(rec_meta, audio_file=f"{created_date}/{spec['id']}/recording.wav")

        # Skip transcription and analysis if meeting is recorded-only
        if spec.get("status") == "recorded":
            continue

        # Write transcription files
        tx_id = f"mock-tx-{spec['id']}"
        tx_meta = {
            "id": tx_id,
            "timestamp": spec["created_at"],
            "audio_filename": "recording.wav",
            "recording_id": spec["id"],
            "model": "mlx-community/nemotron-3.5-asr-streaming-0.6b",
            "language": "it" if lang == "it" else "en",
            "text": spec["text"],
            "segments": [],
            "stats": {"time_total_seconds": 3.4},
            "analysis": None,
            "merged_sources": None,
            "source_tracks": audio_tracks
        }

        tx_file_name = f"mock-transcript-{spec['id']}.json"
        with open(transcriptions_dir / tx_file_name, "w", encoding="utf-8") as f:
            json.dump(tx_meta, f, indent=2, ensure_ascii=False)
        with open(transcriptions_dir / f"mock-transcript-{spec['id']}.txt", "w", encoding="utf-8") as f:
            f.write(spec["text"])

        catalog_store.upsert_transcription(tx_meta, file_name=tx_file_name)

        # Generate and save Analysis Runs
        # 1. meeting_brief
        brief_md = f"# Brief del meeting\n\n**Sintesi**: {spec['brief']}" if lang == "it" else f"# Meeting brief\n\n**Summary**: {spec['brief']}"
        catalog_store.create_analysis_run({
            "id": f"mock-run-{spec['id']}-meeting_brief",
            "scope_type": "recording",
            "scope_id": spec["id"],
            "transcription_id": tx_id,
            "recording_id": spec["id"],
            "analysis_type": "meeting_brief",
            "provider": "mock",
            "model": "nemotron-nano-4b-local",
            "temperature": 0.0,
            "reasoning": "off",
            "effective_reasoning": False,
            "show_thinking": False,
            "json_mode": True,
            "input_hash": f"mock-hash-{spec['id']}-brief",
            "status": "completed",
            "result": {"summary": spec["brief"]},
            "result_markdown": brief_md,
            "source_ids": [spec["id"], tx_id],
            "created_at": spec["created_at"]
        })

        # 2. action_items
        actions_md_parts = []
        if lang == "it":
            actions_md_parts.append("# Azioni operative\n")
            for act in spec["actions"]:
                actions_md_parts.append(f"- **{act['owner']}**: {act['task']} (Scadenza: {act['due_date']}, Priorità: {act['priority']})")
        else:
            actions_md_parts.append("# Action Items\n")
            for act in spec["actions"]:
                actions_md_parts.append(f"- **{act['owner']}**: {act['task']} (Due: {act['due_date']}, Priority: {act['priority']})")
        actions_md = "\n".join(actions_md_parts)
        catalog_store.create_analysis_run({
            "id": f"mock-run-{spec['id']}-action_items",
            "scope_type": "recording",
            "scope_id": spec["id"],
            "transcription_id": tx_id,
            "recording_id": spec["id"],
            "analysis_type": "action_items",
            "provider": "mock",
            "model": "nemotron-nano-4b-local",
            "temperature": 0.0,
            "reasoning": "off",
            "effective_reasoning": False,
            "show_thinking": False,
            "json_mode": True,
            "input_hash": f"mock-hash-{spec['id']}-actions",
            "status": "completed",
            "result": {"action_items": spec["actions"]},
            "result_markdown": actions_md,
            "source_ids": [spec["id"], tx_id],
            "created_at": spec["created_at"]
        })

        # 3. decisions
        decisions_md_parts = []
        if lang == "it":
            decisions_md_parts.append("# Decisioni recenti\n")
            for dec in spec["decisions"]:
                decisions_md_parts.append(f"- **{dec['decision']}**\n  *Razionale*: {dec.get('rationale', 'N/D')}")
        else:
            decisions_md_parts.append("# Recent Decisions\n")
            for dec in spec["decisions"]:
                decisions_md_parts.append(f"- **{dec['decision']}**\n  *Rationale*: {dec.get('rationale', 'N/A')}")
        decisions_md = "\n".join(decisions_md_parts)
        catalog_store.create_analysis_run({
            "id": f"mock-run-{spec['id']}-decisions",
            "scope_type": "recording",
            "scope_id": spec["id"],
            "transcription_id": tx_id,
            "recording_id": spec["id"],
            "analysis_type": "decisions",
            "provider": "mock",
            "model": "nemotron-nano-4b-local",
            "temperature": 0.0,
            "reasoning": "off",
            "effective_reasoning": False,
            "show_thinking": False,
            "json_mode": True,
            "input_hash": f"mock-hash-{spec['id']}-decisions",
            "status": "completed",
            "result": {"decisions": spec["decisions"]},
            "result_markdown": decisions_md,
            "source_ids": [spec["id"], tx_id],
            "created_at": spec["created_at"]
        })

        # 4. risks_blockers
        risks_md_parts = []
        if lang == "it":
            risks_md_parts.append("# Rischi e blocchi\n")
            for rsk in spec["risks"]:
                risks_md_parts.append(f"- **{rsk['risk']}** (Severità: {rsk['severity']})\n  *Prossimo passo*: {rsk['next_step']}")
        else:
            risks_md_parts.append("# Risks and Blockers\n")
            for rsk in spec["risks"]:
                risks_md_parts.append(f"- **{rsk['risk']}** (Severity: {rsk['severity']})\n  *Next step*: {rsk['next_step']}")
        risks_md = "\n".join(risks_md_parts)
        catalog_store.create_analysis_run({
            "id": f"mock-run-{spec['id']}-risks_blockers",
            "scope_type": "recording",
            "scope_id": spec["id"],
            "transcription_id": tx_id,
            "recording_id": spec["id"],
            "analysis_type": "risks_blockers",
            "provider": "mock",
            "model": "nemotron-nano-4b-local",
            "temperature": 0.0,
            "reasoning": "off",
            "effective_reasoning": False,
            "show_thinking": False,
            "json_mode": True,
            "input_hash": f"mock-hash-{spec['id']}-risks",
            "status": "completed",
            "result": {"risks": spec["risks"]},
            "result_markdown": risks_md,
            "source_ids": [spec["id"], tx_id],
            "created_at": spec["created_at"]
        })

    return {"success": True}


@router.post("/v1/system/clear-mock-data")
def clear_mock_data(request: Request):
    import shutil
    from local_asr_server.settings import load_settings

    settings = load_settings()
    recordings_dir = Path(settings["recordings_dir"]).expanduser().resolve()
    transcriptions_dir = Path(settings["transcriptions_dir"]).expanduser().resolve()
    catalog_store = request.app.state.catalog_store

    with catalog_store.connection() as conn:
        mock_rec_ids = [row["id"] for row in conn.execute("SELECT id FROM recordings WHERE id LIKE 'mock-%'").fetchall()]
        conn.execute("DELETE FROM analysis_runs WHERE id LIKE 'mock-%' OR recording_id LIKE 'mock-%'")
        conn.execute("DELETE FROM transcriptions WHERE id LIKE 'mock-%' OR recording_id LIKE 'mock-%'")
        conn.execute("DELETE FROM recordings WHERE id LIKE 'mock-%'")

    for rec_id in mock_rec_ids:
        for p in recordings_dir.glob(f"*/{rec_id}"):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)

    for p in transcriptions_dir.glob("mock-transcript-*"):
        p.unlink(missing_ok=True)

    return {"success": True}


