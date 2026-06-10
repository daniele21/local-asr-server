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
import subprocess
import shutil

logger = logging.getLogger("uvicorn.error")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from local_asr_server.recordings import (
    RecordingConflict,
    RecordingNotFound,
    RecordingStore,
)


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
    title: str = "Registrazione senza titolo"
    mime_type: str = "audio/webm;codecs=opus"
    model: Optional[str] = None
    language: Optional[str] = "it"


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


class AudioRouter:
    _original_output: Optional[str] = None
    _original_input: Optional[str] = None
    _lock = threading.Lock()

    @classmethod
    def _get_switch_audio_cmd(cls) -> Optional[str]:
        if shutil.which("SwitchAudioSource"):
            return "SwitchAudioSource"
        # Apple Silicon Homebrew fallback
        fallback_arm = "/opt/homebrew/bin/SwitchAudioSource"
        if Path(fallback_arm).exists():
            return fallback_arm
        # Intel Homebrew fallback
        fallback_intel = "/usr/local/bin/SwitchAudioSource"
        if Path(fallback_intel).exists():
            return fallback_intel
        return None

    @classmethod
    def get_available_outputs(cls) -> list[str]:
        cmd = cls._get_switch_audio_cmd()
        if not cmd:
            return []
        try:
            output = subprocess.check_output(
                [cmd, "-a", "-t", "output"], text=True, stderr=subprocess.DEVNULL
            )
            return [line.strip() for line in output.splitlines() if line.strip()]
        except Exception as e:
            logger.warning(f"Failed to get available audio outputs: {e}")
            return []

    @classmethod
    def get_available_inputs(cls) -> list[str]:
        cmd = cls._get_switch_audio_cmd()
        if not cmd:
            return []
        try:
            output = subprocess.check_output(
                [cmd, "-a", "-t", "input"], text=True, stderr=subprocess.DEVNULL
            )
            return [line.strip() for line in output.splitlines() if line.strip()]
        except Exception as e:
            logger.warning(f"Failed to get available audio inputs: {e}")
            return []

    @classmethod
    def get_current_output(cls) -> Optional[str]:
        cmd = cls._get_switch_audio_cmd()
        if not cmd:
            return None
        try:
            return subprocess.check_output(
                [cmd, "-c"], text=True, stderr=subprocess.DEVNULL
            ).strip()
        except Exception as e:
            logger.warning(f"Failed to get current audio output: {e}")
            return None

    @classmethod
    def get_current_input(cls) -> Optional[str]:
        cmd = cls._get_switch_audio_cmd()
        if not cmd:
            return None
        try:
            return subprocess.check_output(
                [cmd, "-t", "input", "-c"], text=True, stderr=subprocess.DEVNULL
            ).strip()
        except Exception as e:
            logger.warning(f"Failed to get current audio input: {e}")
            return None

    @classmethod
    def route_to_multi_output(cls) -> bool:
        if sys.platform != "darwin":
            return False
        cmd = cls._get_switch_audio_cmd()
        if not cmd:
            logger.info("switchaudio-osx (SwitchAudioSource) is not installed. Automatic routing skipped.")
            return False

        with cls._lock:
            try:
                # 1. Output Routing
                current_out = cls.get_current_output()
                if current_out:
                    lower_current_out = current_out.lower()
                    if "uscite multiple" in lower_current_out or "multi-output" in lower_current_out:
                        logger.info("Already outputting to a multi-output device.")
                    else:
                        cls._original_output = current_out
                        logger.info(f"Saved original audio output device: '{cls._original_output}'")
                        devices_out = cls.get_available_outputs()
                        target_out = None
                        for dev in devices_out:
                            lower_dev = dev.lower()
                            if "uscite multiple" in lower_dev or "multi-output" in lower_dev:
                                target_out = dev
                                break
                        if not target_out:
                            for dev in devices_out:
                                lower_dev = dev.lower()
                                if "multiple" in lower_dev or "multi" in lower_dev:
                                    target_out = dev
                                    break
                        if target_out:
                            subprocess.run(
                                [cmd, "-s", target_out],
                                check=True,
                                stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL
                            )
                            logger.info(f"Automatically routed system audio output to: '{target_out}'")

                # 2. Input Routing
                current_in = cls.get_current_input()
                if current_in:
                    lower_current_in = current_in.lower()
                    if "dispositivo combinato" in lower_current_in or "aggregate device" in lower_current_in or "combinato" in lower_current_in:
                        logger.info("Already inputting from an aggregate/combined device.")
                    else:
                        cls._original_input = current_in
                        logger.info(f"Saved original audio input device: '{cls._original_input}'")
                        devices_in = cls.get_available_inputs()
                        target_in = None
                        for dev in devices_in:
                            lower_dev = dev.lower()
                            if "dispositivo combinato" in lower_dev or "aggregate device" in lower_dev or "combinato" in lower_dev:
                                target_in = dev
                                break
                        if not target_in:
                            for dev in devices_in:
                                lower_dev = dev.lower()
                                if "aggregate" in lower_dev or "combinat" in lower_dev:
                                    target_in = dev
                                    break
                        if target_in:
                            subprocess.run(
                                [cmd, "-t", "input", "-s", target_in],
                                check=True,
                                stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL
                            )
                            logger.info(f"Automatically routed system audio input to: '{target_in}'")
                
                return True
            except Exception as e:
                logger.warning(f"Error during automatic audio routing: {e}")
                return False

    @classmethod
    def restore_original_output(cls) -> bool:
        if sys.platform != "darwin":
            return False
        cmd = cls._get_switch_audio_cmd()
        if not cmd:
            return False

        with cls._lock:
            try:
                # Restore Output
                if cls._original_output:
                    subprocess.run(
                        [cmd, "-s", cls._original_output],
                        check=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    logger.info(f"Automatically restored original audio output device: '{cls._original_output}'")
                    cls._original_output = None
                
                # Restore Input
                if cls._original_input:
                    subprocess.run(
                        [cmd, "-t", "input", "-s", cls._original_input],
                        check=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    logger.info(f"Automatically restored original audio input device: '{cls._original_input}'")
                    cls._original_input = None
                
                return True
            except Exception as e:
                logger.warning(f"Error during audio output/input restoration: {e}")
                return False


CACHE_DIR = Path(__file__).parent.parent.parent / ".cache"

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
    app.state.recording_store = RecordingStore(
        recordings_dir or Path("~/Recordings/local-asr")
    )

    # Set up static files serving
    static_dir = Path(__file__).parent / "static"
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
        return {
            "ok": True,
            "server": "local-asr-server",
            "backend": "mlx-whisper",
            "default_model": app.state.default_model,
            "endpoints": [
                "POST /v1/audio/transcriptions",
                "POST /v1/audio/transcriptions/path",
                "POST /v1/recordings",
                "POST /v1/recordings/{id}/chunks",
                "POST /v1/recordings/{id}/stop",
                "GET /v1/recordings/{id}",
                "GET /v1/recordings/{id}/audio",
                "GET /health",
            ],
            "recordings": True,
        }

    @app.post("/v1/recordings", status_code=201)
    def create_recording(request: CreateRecordingRequest):
        store: RecordingStore = app.state.recording_store
        try:
            AudioRouter.route_to_multi_output()
            return store.create(
                title=request.title,
                mime_type=request.mime_type,
                model=request.model or app.state.default_model,
                language=request.language,
            )
        except OSError as exc:
            raise HTTPException(status_code=507, detail=str(exc)) from exc

    @app.post("/v1/system/audio-route/test-route")
    def test_audio_route():
        success = AudioRouter.route_to_multi_output()
        return {
            "success": success,
            "original_output": AudioRouter._original_output,
            "original_input": AudioRouter._original_input
        }

    @app.post("/v1/system/audio-route/test-restore")
    def test_audio_restore():
        success = AudioRouter.restore_original_output()
        return {"success": success}

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
            AudioRouter.restore_original_output()
            metadata, _ = store.finalize(recording_id)
            return metadata
        except RecordingNotFound as exc:
            raise HTTPException(status_code=404, detail="Recording not found") from exc
        except RecordingConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=507, detail=str(exc)) from exc

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
                    
                    yield json.dumps({
                        "type": "completed",
                        "data": payload
                    }) + "\n"

                return StreamingResponse(event_generator(), media_type="application/x-ndjson")

            logger.info(f"[/v1/audio/transcriptions] Running non-streaming transcription for {tmp_path} using {target_model}...")
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

            if response_format == "text":
                return PlainTextResponse(payload["text"])

            if response_format == "verbose_json":
                return JSONResponse(payload)

            return JSONResponse({"text": payload["text"]})

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

    return app
