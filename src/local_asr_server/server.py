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
from local_asr_server.recordings import (
    RecordingConflict,
    RecordingNotFound,
    RecordingStore,
)
from local_asr_server.settings import load_settings, save_settings
from local_asr_server.llm import LLMService
from local_asr_server.paths import get_cache_dir, get_static_dir

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
    mime_type: str = "audio/webm;codecs=opus"
    model: Optional[str] = None
    language: Optional[str] = "it"


class UpdateRecordingRequest(BaseModel):
    title: str


class SettingsRequest(BaseModel):
    transcriptions_dir: str
    recordings_dir: Optional[str] = ""
    gemini_api_key: Optional[str] = ""
    llm_provider: Optional[str] = "mock"


def _str_to_bool(value: str | bool | None, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return value.lower() in {"1", "true", "yes", "y", "on"}


def _transcribe(
    *,
    audio_path: str,
    model: str,
    language: Optional[str],
    task: str,
    word_timestamps: bool,
    initial_prompt: Optional[str],
    temperature: Optional[float],
    condition_on_previous_text: bool,
    verbose: Optional[bool],
) -> dict:
    import mlx_whisper

    if not language:
        language = None

    kwargs = {
        "path_or_hf_repo": model,
        "language": language,
        "task": task,
        "word_timestamps": word_timestamps,
        "initial_prompt": initial_prompt,
        "condition_on_previous_text": condition_on_previous_text,
        "verbose": verbose,
    }

    if temperature is not None:
        kwargs["temperature"] = temperature

    kwargs = {k: v for k, v in kwargs.items() if v is not None}

    return mlx_whisper.transcribe(
        audio_path,
        **kwargs,
    )


class ThreadStdoutCapture:
    def __init__(self, q: queue.Queue):
        self.q = q
        self.original_stdout = sys.stdout

    def write(self, text):
        self.original_stdout.write(text)
        self.original_stdout.flush()
        if text.strip():
            self.q.put(text.strip())

    def flush(self):
        self.original_stdout.flush()


def _is_model_cached(model_name: str) -> bool:
    if model_name.startswith("/") or model_name.startswith("."):
        return Path(model_name).exists()
    
    # Hugging Face cache check
    folder_name = "models--" + model_name.replace("/", "--")
    cache_dir = Path(os.path.expanduser("~/.cache/huggingface/hub")) / folder_name
    if cache_dir.exists():
        snapshots_dir = cache_dir / "snapshots"
        if snapshots_dir.exists():
            for p in snapshots_dir.iterdir():
                if p.is_dir() and any(p.iterdir()):
                    return True
    return False




# Cache directory — uses macOS Application Support in bundle mode,
# or a project-local .cache/ in dev mode.
CACHE_DIR = get_cache_dir()

import math

def _clean_nan_values(val):
    if isinstance(val, dict):
        return {k: _clean_nan_values(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [_clean_nan_values(x) for x in val]
    elif isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    return val

def _get_cached_result(cache_key: str) -> Optional[dict]:
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return _clean_nan_values(data)
        except Exception as e:
            logger.warning(f"Failed to read cache file {cache_file}: {e}")
    return None

def _save_cached_result(cache_key: str, data: dict) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = CACHE_DIR / f"{cache_key}.json"
        cleaned_data = _clean_nan_values(data)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, ensure_ascii=False, indent=2)
        logger.info(f"Saved transcription to cache: {cache_file}")
    except Exception as e:
        logger.warning(f"Failed to write cache file {cache_file}: {e}")



def create_app(
    default_model: str = "mlx-community/whisper-large-v3-turbo",
    recordings_dir: Path | None = None,
) -> FastAPI:
    app = FastAPI(
        title="local-asr-server",
        version="0.1.0",
        description="Local ASR server powered by MLX Whisper.",
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
    app.state.recording_store = RecordingStore(
        recordings_dir or Path("~/Recordings/local-asr")
    )
    from local_asr_server.transcriptions import TranscriptionStore
    app.state.transcription_store = TranscriptionStore()

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
    ):
        started_at = time.perf_counter()
        is_streaming = _str_to_bool(stream)
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
            param_string = f"{audio_hash}:{target_model}:{language}:{task}:{word_timestamps}:{temperature}:{condition_on_previous_text}"
            cache_key = hashlib.sha256(param_string.encode("utf-8")).hexdigest()

            cached_res = _get_cached_result(cache_key)
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
                saved_meta = app.state.transcription_store.save(cached_res, audio_filename=file.filename)
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
                async def event_generator():
                    app.state.is_transcribing = True
                    try:
                        q = queue.Queue()
                        
                        is_cached = _is_model_cached(target_model)
                        logger.info(f"[/v1/audio/transcriptions] Model cache status for {target_model}: cached={is_cached}")

                        if is_cached:
                            yield json.dumps({
                                "type": "progress",
                                "step": "loading_model",
                                "message": "Caricamento del modello Whisper in memoria..."
                            }) + "\n"
                        else:
                            yield json.dumps({
                                "type": "progress",
                                "step": "downloading",
                                "message": f"Download del modello '{target_model}' da Hugging Face (~1.6 GB)..."
                            }) + "\n"

                        transcribe_result = {}
                        transcribe_error = None

                        def worker():
                            nonlocal transcribe_error
                            try:
                                logger.info(f"[/v1/audio/transcriptions] [Worker Thread] Starting transcription for {tmp_path}")
                                capture = ThreadStdoutCapture(q)
                                with contextlib.redirect_stdout(capture):
                                    res = _transcribe(
                                        audio_path=tmp_path,
                                        model=target_model,
                                        language=language,
                                        task=task,
                                        word_timestamps=_str_to_bool(word_timestamps),
                                        initial_prompt=initial_prompt,
                                        temperature=temperature,
                                        condition_on_previous_text=_str_to_bool(condition_on_previous_text, True),
                                        verbose=True,
                                    )
                                    transcribe_result.update(res)
                                logger.info(f"[/v1/audio/transcriptions] [Worker Thread] Transcription completed successfully")
                            except Exception as e:
                                logger.error(f"[/v1/audio/transcriptions] [Worker Thread] Transcription failed: {e}", exc_info=True)
                                transcribe_error = e

                        t = threading.Thread(target=worker)
                        t.start()

                        while t.is_alive() or not q.empty():
                            try:
                                msg = q.get_nowait()
                                logger.info(f"[/v1/audio/transcriptions] [Live Segment] {msg}")
                                yield json.dumps({
                                    "type": "progress",
                                    "step": "transcribing",
                                    "message": msg
                                }) + "\n"
                            except queue.Empty:
                                await asyncio.sleep(0.1)

                        t.join()

                        try:
                            if os.path.exists(tmp_path):
                                os.remove(tmp_path)
                                logger.info(f"[/v1/audio/transcriptions] Cleaned up temporary file: {tmp_path}")
                        except OSError as e:
                            logger.warning(f"[/v1/audio/transcriptions] Failed to remove temp file {tmp_path}: {e}")

                        if transcribe_error:
                            yield json.dumps({
                                "type": "error",
                                "message": f"Transcription failed: {transcribe_error}"
                            }) + "\n"
                            return

                        elapsed = time.perf_counter() - started_at
                        logger.info(f"[/v1/audio/transcriptions] Total processing time (streaming): {elapsed:.2f} seconds")
                        
                        payload = {
                            "text": transcribe_result.get("text", ""),
                            "language": transcribe_result.get("language", language),
                            "segments": transcribe_result.get("segments", []),
                            "model": target_model,
                            "backend": "mlx-whisper",
                            "stats": {
                                "time_total_seconds": elapsed,
                            },
                        }
                        payload = _clean_nan_values(payload)
                        _save_cached_result(cache_key, payload)
                        
                        saved_meta = app.state.transcription_store.save(payload, audio_filename=file.filename)
                        payload["saved_id"] = saved_meta["id"]
                        payload["saved_file_path"] = str(app.state.transcription_store.root)
                        
                        yield json.dumps({
                            "type": "completed",
                            "data": payload
                        }) + "\n"
                    finally:
                        app.state.is_transcribing = False

                return StreamingResponse(event_generator(), media_type="application/x-ndjson")

            logger.info(f"[/v1/audio/transcriptions] Running non-streaming transcription for {tmp_path} using {target_model}...")
            app.state.is_transcribing = True
            try:
                result = _transcribe(
                    audio_path=tmp_path,
                    model=target_model,
                    language=language,
                    task=task,
                    word_timestamps=_str_to_bool(word_timestamps),
                    initial_prompt=initial_prompt,
                    temperature=temperature,
                    condition_on_previous_text=_str_to_bool(condition_on_previous_text, True),
                    verbose=None if verbose is None else _str_to_bool(verbose),
                )

                elapsed = time.perf_counter() - started_at
                logger.info(f"[/v1/audio/transcriptions] Transcription completed in {elapsed:.2f} seconds")

                payload = {
                    "text": result.get("text", ""),
                    "language": result.get("language", language),
                    "segments": result.get("segments", []),
                    "model": target_model,
                    "backend": "mlx-whisper",
                    "stats": {
                        "time_total_seconds": elapsed,
                    },
                }
                payload = _clean_nan_values(payload)
                _save_cached_result(cache_key, payload)

                saved_meta = app.state.transcription_store.save(payload, audio_filename=file.filename)
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
            result = _transcribe(
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
            return store.update_title(recording_id, request.title)
        except RecordingNotFound as exc:
            raise HTTPException(status_code=404, detail="Recording not found") from exc

    @app.get("/v1/settings")
    def get_settings():
        return load_settings()

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
        save_settings(current)
        return current

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
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

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

    return app
