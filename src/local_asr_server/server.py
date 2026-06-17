from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path
from typing import Optional
import json
import threading
import queue
import contextlib
import sys
import asyncio
import logging
import hashlib

logger = logging.getLogger("uvicorn.error")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from local_asr_server.audio_router import AudioRouter
from local_asr_server.catalog import CatalogStore
from local_asr_server.recordings import (
    RecordingConflict,
    RecordingNotFound,
    RecordingStore,
)
from local_asr_server.settings import load_settings, save_settings
from local_asr_server.llm import LLMService
from local_asr_server.paths import get_cache_dir, get_static_dir
from local_asr_server.transcriber import (
    str_to_bool,
    generate_cache_key,
    get_cached_result,
    save_cached_result,
    transcribe_file_sync,
    transcribe_stream_generator,
    _clean_nan_values,
)

class AnalysisRequest(BaseModel):
    transcription_id: Optional[str] = None
    text: Optional[str] = None
    gemini_api_key: Optional[str] = None
    llm_provider: Optional[str] = None

class TranscribePathRequest(BaseModel):
    file: str
    model: Optional[str] = None
    language: Optional[str] = "it"
    task: str = "transcribe"
    response_format: str = "json"
    word_timestamps: bool = False
    initial_prompt: Optional[str] = None
    temperature: Optional[float] = None
    condition_on_previous_text: bool = True
    verbose: Optional[bool] = None


class CreateRecordingRequest(BaseModel):
    title: Optional[str] = None
    project_name: Optional[str] = ""
    mime_type: str = "audio/webm;codecs=opus"
    model: Optional[str] = None
    language: Optional[str] = "it"


class UpdateRecordingRequest(BaseModel):
    title: Optional[str] = None
    project_name: Optional[str] = None


class SettingsRequest(BaseModel):
    transcriptions_dir: str
    recordings_dir: Optional[str] = ""
    gemini_api_key: Optional[str] = ""
    llm_provider: Optional[str] = "mock"
    default_model: Optional[str] = ""
    default_language: Optional[str] = "it"
    default_task: Optional[str] = "transcribe"
    default_temperature: Optional[str] = ""
    default_word_timestamps: Optional[bool] = False
    default_condition_on_previous: Optional[bool] = True


class MergeTranscriptionsRequest(BaseModel):
    transcription_ids: list[str]
    title: Optional[str] = None


class OverlayRequest(BaseModel):
    show: bool


def _build_projects(app: FastAPI) -> dict:
    recordings = app.state.recording_store.list(limit=999)
    projects: dict[str, dict] = {}
    unassigned_name = "Senza progetto"
    for recording in recordings:
        project_name = (recording.get("project_name") or "").strip() or unassigned_name
        bucket = projects.setdefault(project_name, {
            "name": project_name,
            "is_unassigned": project_name == unassigned_name,
            "items": [],
        })
        audio_name = Path(recording.get("audio_file") or "").name
        extension = Path(audio_name).suffix or recording.get("extension") or ""
        title_audio_name = f"{recording.get('title')}{extension}" if extension else ""
        transcription = app.state.transcription_store.find_for_recording(recording["id"], audio_name)
        if transcription is None and title_audio_name:
            transcription = app.state.transcription_store.find_for_recording("", title_audio_name)
        bucket["items"].append({
            "recording": recording,
            "transcription": transcription,
            "analysis": transcription.get("analysis") if transcription else None,
        })
    items = sorted(projects.values(), key=lambda item: (item["is_unassigned"], item["name"].lower()))
    return {"items": items}


# (Transcription and caching helper methods have been refactored to local_asr_server.transcriber)



def create_app(
    default_model: str = "mlx-community/whisper-large-v3-turbo",
    recordings_dir: Path | None = None,
) -> FastAPI:
    app = FastAPI(
        title="ClosedRoom",
        version="0.1.0",
        description="Local ASR transcription server powered by MLX Whisper.",
    )

    # Enable CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.default_model = default_model
    app.state.is_recording = False
    app.state.is_transcribing = False
    from local_asr_server import transcriptions as transcriptions_module
    temp_root = Path(tempfile.gettempdir()).resolve()
    transcriptions_root = Path(
        transcriptions_module.load_settings()["transcriptions_dir"]
    ).expanduser().resolve()
    if temp_root in transcriptions_root.parents or transcriptions_root == temp_root:
        catalog_path = transcriptions_root / "closedroom.db"
    elif recordings_dir is not None and temp_root in recordings_dir.expanduser().resolve().parents:
        catalog_path = recordings_dir.expanduser().resolve() / "closedroom.db"
    else:
        catalog_path = CatalogStore.default_db_path()
    app.state.catalog_store = CatalogStore(catalog_path)
    app.state.recording_store = RecordingStore(
        recordings_dir or Path("~/Recordings/local-asr"),
        use_settings_dir=recordings_dir is None,
        catalog=app.state.catalog_store,
    )
    from local_asr_server.transcriptions import TranscriptionStore
    app.state.transcription_store = TranscriptionStore(catalog=app.state.catalog_store)

    # Clean up any orphan aggregate devices from previous runs/crashes
    AudioRouter.cleanup_orphans()

    # Set up static files serving — resolves correctly in both dev and bundle.
    static_dir = get_static_dir()
    static_dir.mkdir(exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    public_dir = Path(__file__).parents[2] / "public"
    if public_dir.exists():
        app.mount("/public", StaticFiles(directory=str(public_dir)), name="public")

    @app.get("/")
    def read_index() -> FileResponse:
        return FileResponse(
            static_dir / "index.html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
        )

    @app.get("/health")
    def health() -> dict:
        status_str = "recording" if app.state.is_recording else ("transcribing" if app.state.is_transcribing else "idle")
        return {
            "ok": True,
            "server": "local-asr-server",
            "backend": "mlx-whisper",
            "default_model": app.state.default_model,
            "status": status_str,
            "endpoints": [
                "POST /v1/audio/transcriptions",
                "POST /v1/audio/transcriptions/path",
                "POST /v1/recordings",
                "POST /v1/recordings/{id}/chunks",
                "POST /v1/recordings/{id}/stop",
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

    @app.post("/v1/recordings", status_code=201)
    def create_recording(request: CreateRecordingRequest):
        store: RecordingStore = app.state.recording_store
        try:
            res = store.create(
                title=request.title,
                project_name=request.project_name,
                mime_type=request.mime_type,
                model=request.model or app.state.default_model,
                language=request.language,
            )
            app.state.is_recording = True
            return res
        except OSError as exc:
            raise HTTPException(status_code=507, detail=str(exc)) from exc

    @app.get("/v1/system/audio/status")
    def audio_status():
        return AudioRouter.get_status()

    @app.post("/v1/system/audio/activate")
    def activate_audio_route():
        success = AudioRouter.route_to_multi_output()
        status = AudioRouter.get_status()
        return {
            **status,
            "success": success,
            "routing_active": success,
        }

    @app.post("/v1/system/audio/restore")
    def restore_audio_route():
        success = AudioRouter.restore_original_output()
        return {
            **AudioRouter.get_status(),
            "success": success,
            "routing_active": False,
        }

    # Compatibility aliases for the existing advanced-controls button.
    @app.post("/v1/system/audio-route/test-route")
    def test_audio_route():
        return activate_audio_route()

    @app.post("/v1/system/audio-route/test-restore")
    def test_audio_restore():
        return restore_audio_route()

    @app.post("/v1/recordings/{recording_id}/chunks")
    async def append_recording_chunk(
        recording_id: str,
        file: UploadFile = File(...),
        sequence: int = Form(...),
    ):
        store: RecordingStore = app.state.recording_store
        try:
            content = await file.read()
            return store.append_chunk(recording_id, sequence, content)
        except RecordingNotFound as exc:
            raise HTTPException(status_code=404, detail="Recording not found") from exc
        except RecordingConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=507, detail=str(exc)) from exc

    @app.post("/v1/recordings/{recording_id}/stop", status_code=202)
    def stop_recording(recording_id: str):
        store: RecordingStore = app.state.recording_store
        try:
            metadata, _ = store.finalize(recording_id)
            return metadata
        except RecordingNotFound as exc:
            raise HTTPException(status_code=404, detail="Recording not found") from exc
        except RecordingConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=507, detail=str(exc)) from exc
        finally:
            app.state.is_recording = False

    @app.get("/v1/recordings/{recording_id}")
    def get_recording(recording_id: str):
        try:
            return app.state.recording_store.get(recording_id)
        except RecordingNotFound as exc:
            raise HTTPException(status_code=404, detail="Recording not found") from exc

    @app.get("/v1/recordings/{recording_id}/audio")
    def get_recording_audio(recording_id: str):
        store: RecordingStore = app.state.recording_store
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

    @app.get("/v1/recordings")
    def list_recordings(limit: int = 20):
        return {"items": app.state.recording_store.list(limit)}

    @app.get("/v1/transcription/source-data")
    def transcription_source_data(limit: int = 100):
        recordings = app.state.recording_store.list(limit=max(1, min(limit, 200)))
        projects = _build_projects(app)
        settings = load_settings()
        return {
            "recordings": recordings,
            "recordings_count": len(recordings),
            "projects": projects["items"],
            "settings": {
                "recordings_dir": settings.get("recordings_dir", ""),
                "default_model": settings.get("default_model", ""),
                "default_language": settings.get("default_language", "it"),
                "default_task": settings.get("default_task", "transcribe"),
                "default_word_timestamps": settings.get("default_word_timestamps", False),
                "default_condition_on_previous": settings.get("default_condition_on_previous", True),
            },
        }

    @app.post("/v1/audio/transcriptions")
    async def transcribe_upload(
        file: UploadFile = File(...),
        model: Optional[str] = Form(None),
        language: Optional[str] = Form("it"),
        task: str = Form("transcribe"),
        response_format: str = Form("json"),
        word_timestamps: str = Form("false"),
        initial_prompt: Optional[str] = Form(None),
        temperature: Optional[float] = Form(None),
        condition_on_previous_text: str = Form("true"),
        verbose: Optional[str] = Form(None),
        stream: str = Form("false"),
        recording_id: Optional[str] = Form(None),
    ):
        started_at = time.perf_counter()
        is_streaming = str_to_bool(stream)
        target_model = model or app.state.default_model

        logger.info(f"[/v1/audio/transcriptions] Received upload request. File: '{file.filename}', Size: {file.size if file.size else 'unknown'} bytes, Model: '{target_model}', Stream: {is_streaming}")

        suffix = Path(file.filename or "audio").suffix or ".audio"

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp_path = tmp.name
                content = await file.read()
                tmp.write(content)
            
            logger.info(f"[/v1/audio/transcriptions] Saved uploaded file to temporary path: {tmp_path}")

            # Caching mechanism
            audio_hash = hashlib.sha256(content).hexdigest()
            cache_key = generate_cache_key(
                audio_hash=audio_hash,
                model=target_model,
                language=language,
                task=task,
                word_timestamps=word_timestamps,
                temperature=temperature,
                condition_on_previous_text=condition_on_previous_text,
            )

            cached_res = get_cached_result(cache_key)
            if cached_res is not None:
                logger.info(f"[/v1/audio/transcriptions] Cache hit! Returning cached result for key: {cache_key}")
                
                # Cleanup temp file as it's not needed
                try:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
                        logger.info(f"[/v1/audio/transcriptions] Cleaned up temporary file: {tmp_path}")
                except OSError as e:
                    logger.warning(f"[/v1/audio/transcriptions] Failed to remove temp file {tmp_path}: {e}")

                # Save to user's transcription folder as well
                cached_res["recording_id"] = recording_id or cached_res.get("recording_id", "")
                saved_meta = app.state.transcription_store.save(cached_res, audio_filename=file.filename, recording_id=recording_id)
                cached_res["saved_id"] = saved_meta["id"]
                cached_res["saved_file_path"] = str(app.state.transcription_store.root)

                if is_streaming:
                    async def cached_event_generator():
                        yield json.dumps({
                            "type": "progress",
                            "step": "loading_model",
                            "message": "Caricamento risultato della trascrizione da cache locale..."
                        }) + "\n"
                        await asyncio.sleep(0.5)
                        yield json.dumps({
                            "type": "completed",
                            "data": cached_res
                        }) + "\n"
                    return StreamingResponse(cached_event_generator(), media_type="application/x-ndjson")
                else:
                    if response_format == "text":
                        return PlainTextResponse(cached_res["text"])
                    if response_format == "verbose_json":
                        return JSONResponse(cached_res)
                    return JSONResponse({"text": cached_res["text"]})

            # Cache miss, proceed as normal
            if is_streaming:
                async def event_generator_wrapper():
                    app.state.is_transcribing = True
                    try:
                        async for event in transcribe_stream_generator(
                            audio_path=tmp_path,
                            model=target_model,
                            language=language,
                            task=task,
                            word_timestamps=word_timestamps,
                            initial_prompt=initial_prompt,
                            temperature=temperature,
                            condition_on_previous_text=condition_on_previous_text,
                            cache_key=cache_key,
                            audio_filename=file.filename,
                            recording_id=recording_id,
                            transcription_store=app.state.transcription_store,
                            started_at=started_at,
                        ):
                            yield event
                    finally:
                        app.state.is_transcribing = False

                return StreamingResponse(event_generator_wrapper(), media_type="application/x-ndjson")

            logger.info(f"[/v1/audio/transcriptions] Running non-streaming transcription for {tmp_path} using {target_model}...")
            app.state.is_transcribing = True
            try:
                result = transcribe_file_sync(
                    audio_path=tmp_path,
                    model=target_model,
                    language=language,
                    task=task,
                    word_timestamps=str_to_bool(word_timestamps),
                    initial_prompt=initial_prompt,
                    temperature=temperature,
                    condition_on_previous_text=str_to_bool(condition_on_previous_text, True),
                    verbose=None if verbose is None else str_to_bool(verbose),
                )

                elapsed = time.perf_counter() - started_at
                logger.info(f"[/v1/audio/transcriptions] Transcription completed in {elapsed:.2f} seconds")

                payload = {
                    "text": result.get("text", ""),
                    "language": result.get("language", language),
                    "segments": result.get("segments", []),
                    "model": target_model,
                    "backend": "mlx-whisper",
                    "recording_id": recording_id or "",
                    "stats": {
                        "time_total_seconds": elapsed,
                    },
                }
                payload = _clean_nan_values(payload)
                save_cached_result(cache_key, payload)

                saved_meta = app.state.transcription_store.save(payload, audio_filename=file.filename, recording_id=recording_id)
                payload["saved_id"] = saved_meta["id"]
                payload["saved_file_path"] = str(app.state.transcription_store.root)

                if response_format == "text":
                    return PlainTextResponse(payload["text"])

                if response_format == "verbose_json":
                    return JSONResponse(payload)

                return JSONResponse({"text": payload["text"]})
            finally:
                app.state.is_transcribing = False

        except Exception as exc:
            logger.error(f"[/v1/audio/transcriptions] Request failed: {exc}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Transcription failed: {exc}",
            ) from exc

        finally:
            if not is_streaming and 'cached_res' in locals() and cached_res is None:
                try:
                    if "tmp_path" in locals() and os.path.exists(tmp_path):
                        os.remove(tmp_path)
                        logger.info(f"[/v1/audio/transcriptions] Cleaned up temporary file: {tmp_path}")
                except OSError as e:
                    logger.warning(f"[/v1/audio/transcriptions] Failed to remove temp file {tmp_path}: {e}")

    @app.post("/v1/audio/transcriptions/path")
    def transcribe_path(request: TranscribePathRequest):
        started_at = time.perf_counter()
        target_model = request.model or app.state.default_model

        audio_path = Path(request.file).expanduser()
        logger.info(f"[/v1/audio/transcriptions/path] Received request for file: '{audio_path}', Model: '{target_model}'")

        if not audio_path.exists():
            logger.error(f"[/v1/audio/transcriptions/path] File not found: '{audio_path}'")
            raise HTTPException(
                status_code=404,
                detail=f"Audio file not found: {audio_path}",
            )

        app.state.is_transcribing = True
        try:
            result = transcribe_file_sync(
                audio_path=str(audio_path),
                model=target_model,
                language=request.language,
                task=request.task,
                word_timestamps=request.word_timestamps,
                initial_prompt=request.initial_prompt,
                temperature=request.temperature,
                condition_on_previous_text=request.condition_on_previous_text,
                verbose=request.verbose,
            )

            elapsed = time.perf_counter() - started_at
            logger.info(f"[/v1/audio/transcriptions/path] Finished processing. Time taken: {elapsed:.2f} seconds")

            payload = {
                "text": result.get("text", ""),
                "language": result.get("language", request.language),
                "segments": result.get("segments", []),
                "model": target_model,
                "backend": "mlx-whisper",
                "stats": {
                    "time_total_seconds": elapsed,
                },
            }

            saved_meta = app.state.transcription_store.save(payload, audio_filename=audio_path.name)
            payload["saved_id"] = saved_meta["id"]
            payload["saved_file_path"] = str(app.state.transcription_store.root)

            if request.response_format == "text":
                return PlainTextResponse(payload["text"])

            if request.response_format == "verbose_json":
                return JSONResponse(payload)

            return JSONResponse({"text": payload["text"]})

        except Exception as exc:
            logger.error(f"[/v1/audio/transcriptions/path] Transcription failed: {exc}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Transcription failed: {exc}",
            ) from exc
        finally:
            app.state.is_transcribing = False

    @app.patch("/v1/recordings/{recording_id}")
    def update_recording(recording_id: str, request: UpdateRecordingRequest):
        store: RecordingStore = app.state.recording_store
        try:
            return store.update(
                recording_id,
                title=request.title,
                project_name=request.project_name,
            )
        except RecordingNotFound as exc:
            raise HTTPException(status_code=404, detail="Recording not found") from exc

    @app.get("/v1/recordings/{recording_id}/project")
    def get_recording_project(recording_id: str):
        try:
            recording = app.state.recording_store.get(recording_id)
        except RecordingNotFound as exc:
            raise HTTPException(status_code=404, detail="Recording not found") from exc
        audio_name = Path(recording.get("audio_file") or "").name
        extension = Path(audio_name).suffix or recording.get("extension") or ""
        title_audio_name = f"{recording.get('title')}{extension}" if extension else ""
        transcription = app.state.transcription_store.find_for_recording(recording_id, audio_name)
        if transcription is None and title_audio_name:
            transcription = app.state.transcription_store.find_for_recording("", title_audio_name)
        return {
            "recording": recording,
            "transcription": transcription,
            "analysis": transcription.get("analysis") if transcription else None,
        }

    @app.get("/v1/projects")
    def list_projects():
        return _build_projects(app)

    @app.get("/v1/models/check-cache")
    def check_model_cache(model: Optional[str] = None):
        from local_asr_server.transcriber import is_model_cached
        target = model if model else app.state.default_model
        return {"model": target, "cached": is_model_cached(target)}

    @app.get("/v1/settings")
    def get_settings():
        return load_settings()

    @app.get("/v1/stats")
    def get_stats():
        stats = app.state.catalog_store.stats()
        if stats["latest_recording"] is None:
            recordings = app.state.recording_store.list(limit=1)
            stats["latest_recording"] = recordings[0] if recordings else None
        return stats

    @app.post("/v1/settings")
    def update_settings(request: SettingsRequest):
        current = load_settings()
        
        # Validate transcriptions_dir
        trans_path = Path(request.transcriptions_dir).expanduser().resolve()
        try:
            trans_path.mkdir(parents=True, exist_ok=True)
            test_file = trans_path / ".write_test"
            test_file.touch()
            test_file.unlink()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Directory trascrizioni non valida o non scrivibile: {e}")
        current["transcriptions_dir"] = str(trans_path)

        # Validate recordings_dir if provided
        if request.recordings_dir:
            rec_path = Path(request.recordings_dir).expanduser().resolve()
            try:
                rec_path.mkdir(parents=True, exist_ok=True)
                test_file = rec_path / ".write_test"
                test_file.touch()
                test_file.unlink()
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Directory audio non valida o non scrivibile: {e}")
            current["recordings_dir"] = str(rec_path)
            
        current["gemini_api_key"] = request.gemini_api_key or ""
        current["llm_provider"] = request.llm_provider or "mock"
        current["default_model"] = request.default_model or ""
        current["default_language"] = request.default_language or "it"
        current["default_task"] = request.default_task or "transcribe"
        current["default_temperature"] = request.default_temperature or ""
        current["default_word_timestamps"] = request.default_word_timestamps if request.default_word_timestamps is not None else False
        current["default_condition_on_previous"] = request.default_condition_on_previous if request.default_condition_on_previous is not None else True
        save_settings(current)
        return current

    @app.post("/v1/system/window/overlay")
    def toggle_overlay_window(request: OverlayRequest):
        window_manager = getattr(app.state, "window_manager", None)
        if not window_manager:
            return {"success": False, "error": "Native window manager not available"}
            
        from local_asr_server.window import run_on_main_thread
        
        if request.show:
            run_on_main_thread(window_manager.show_overlay)
        else:
            run_on_main_thread(window_manager.hide_overlay)
            
        return {"success": True}

    @app.post("/v1/system/select-directory")
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

    @app.post("/v1/analysis")
    def analyze_transcription(request: AnalysisRequest):
        text_to_analyze = ""
        if request.transcription_id:
            try:
                trans = app.state.transcription_store.get(request.transcription_id)
                text_to_analyze = trans.get("text", "")
            except Exception:
                raise HTTPException(status_code=404, detail="Trascrizione non trovata.")
        elif request.text:
            text_to_analyze = request.text
        else:
            raise HTTPException(status_code=400, detail="Fornire transcription_id o text.")

        if not text_to_analyze.strip():
            raise HTTPException(status_code=400, detail="Il testo da analizzare è vuoto.")

        settings = load_settings()
        provider_name = request.llm_provider or settings.get("llm_provider", "mock")
        api_key = request.gemini_api_key or settings.get("gemini_api_key", "")

        try:
            provider = LLMService.get_provider(provider_name, api_key)
            result = provider.analyze(text_to_analyze)
            if request.transcription_id:
                app.state.transcription_store.save_analysis(request.transcription_id, result)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/v1/transcriptions/merge")
    def merge_transcriptions(request: MergeTranscriptionsRequest):
        try:
            return app.state.transcription_store.merge(
                transcription_ids=request.transcription_ids,
                title=request.title
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Merge failed: {exc}") from exc

    @app.get("/v1/transcriptions")
    def list_transcriptions(page: int = 1, limit: int = 10):
        items, total = app.state.transcription_store.list(page=page, limit=limit)
        return {"items": items, "total": total, "page": page, "limit": limit}

    @app.get("/v1/transcriptions/{transcription_id}")
    def get_transcription(transcription_id: str):
        try:
            return app.state.transcription_store.get(transcription_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Transcription not found")

    @app.delete("/v1/transcriptions/{transcription_id}")
    def delete_transcription(transcription_id: str):
        success = app.state.transcription_store.delete(transcription_id)
        if not success:
            raise HTTPException(status_code=404, detail="Transcription not found")
        return {"ok": True}

    @app.post("/v1/transcriptions/{transcription_id}/split")
    def split_transcription(transcription_id: str):
        try:
            restored_ids = app.state.transcription_store.split(transcription_id)
            return {"ok": True, "restored_ids": restored_ids}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Mount root static files at the end so it doesn't override API routes
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="root_static")

    return app
