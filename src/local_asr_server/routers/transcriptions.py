from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse

from local_asr_server.recordings import RecordingConflict, RecordingNotFound, RecordingStore
from local_asr_server.transcription_jobs import TranscriptionJob, TranscriptionJobManager
from local_asr_server.settings import load_settings
from local_asr_server.audio_intelligence import build_audio_intelligence
from local_asr_server.transcriber import (
    str_to_bool,
    generate_cache_key,
    get_cached_result,
    save_cached_result,
    transcribe_file_sync,
    transcribe_stream_generator,
    _clean_nan_values,
    VAD_GUIDED_DEFAULT,
)
from local_asr_server.schemas import (
    TranscribePathRequest,
    TranscribeRecordingRequest,
    TranscriptionJobRequest,
    MergeTranscriptionsRequest,
)
from local_asr_server.routers.helpers import _build_projects, _merge_track_transcriptions

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


def _get_transcribe_file_sync():
    import sys
    server_mod = sys.modules.get("local_asr_server.server")
    if server_mod and hasattr(server_mod, "transcribe_file_sync"):
        return server_mod.transcribe_file_sync
    return transcribe_file_sync


def _transcribe_file(app: Any, **kwargs: Any) -> dict[str, Any]:
    patched_transcriber = _get_transcribe_file_sync()
    if patched_transcriber is not transcribe_file_sync:
        return patched_transcriber(**kwargs)
    service = getattr(app.state, "transcription_service", None)
    if service is not None:
        return service.transcribe_file(**kwargs)
    return transcribe_file_sync(**kwargs)


def run_recording_transcription(
    app: Any,
    recording_id: str,
    body: TranscribeRecordingRequest,
    job: TranscriptionJob | None = None,
) -> dict:
    started_at = time.perf_counter()
    target_model = body.model or app.state.default_model
    store: RecordingStore = app.state.recording_store
    recording = store.get(recording_id, include_result=False)
    track_paths = store.transcribable_tracks(recording_id)

    def job_event(status: str, step: str, progress: int):
        if job is None:
            return
        job.status = status
        job.current_step = step
        job.progress = progress
        job.updated_at = time.time()
        job.events.put(job.public())

    job_event("validating_audio", "validating_audio", 10)
    track_results = []
    total_tracks = max(1, len(track_paths))
    for index, (track, audio_path) in enumerate(track_paths):
        if job and job.cancel_requested:
            raise RuntimeError("Transcription job cancelled")
        step = "transcribing_system" if track.get("id") == "system" else "transcribing_mic"
        job_event(step, step, 20 + int(index / total_tracks * 60))
        result = _transcribe_file(
            app,
            audio_path=str(audio_path),
            model=target_model,
            language=body.language,
            task=body.task,
            word_timestamps=body.word_timestamps,
            initial_prompt=body.initial_prompt,
            temperature=body.temperature,
            condition_on_previous_text=body.condition_on_previous_text,
            verbose=body.verbose,
            vad_guided=body.vad_guided,
        )
        public_track = next(
            (item for item in recording.get("audio_tracks", []) if item.get("id") == track["id"]),
            track,
        )
        track_results.append({"track": public_track, "result": result})

    job_event("merging", "merging", 85)
    elapsed = time.perf_counter() - started_at
    payload = _merge_track_transcriptions(
        track_results,
        model=target_model,
        language=body.language,
        elapsed=elapsed,
        recording_id=recording_id,
    )
    payload = _attach_audio_intelligence(store, recording_id, track_paths, payload)
    payload = _clean_nan_values(payload)
    job_event("saving", "saving", 95)
    saved_meta = app.state.transcription_store.save(
        payload,
        audio_filename=recording.get("title") or Path(recording.get("audio_file") or "recording").name,
        recording_id=recording_id,
    )
    payload["saved_id"] = saved_meta["id"]
    payload["saved_file_path"] = str(app.state.transcription_store.root)
    return payload


def _attach_audio_intelligence(
    store: RecordingStore,
    recording_id: str,
    track_paths: list[tuple[dict[str, Any], Path]],
    payload: dict[str, Any],
) -> dict[str, Any]:
    try:
        intelligence = build_audio_intelligence(track_paths, payload.get("segments", []))
        store.save_intelligence(recording_id, intelligence)
        payload["segments"] = intelligence.get("segments", payload.get("segments", []))
        payload["insight_candidates"] = intelligence.get("insight_candidates", [])
        payload.setdefault("stats", {})["audio_intelligence"] = {
            "enabled": True,
            "version": intelligence.get("version"),
            "backend": intelligence.get("backend"),
            "mode": intelligence.get("mode"),
            "mock_insights": True,
            "speaking_time_pct": intelligence.get("conversation_metrics", {}).get("speaking_time_pct", {}),
            "long_pause_count": len(intelligence.get("conversation_metrics", {}).get("long_pauses", []) or []),
            "overlap_count": len(intelligence.get("conversation_metrics", {}).get("overlaps", []) or []),
        }
    except Exception as exc:
        logger.warning("Audio intelligence failed for recording %s: %s", recording_id, exc)
        payload.setdefault("stats", {})["audio_intelligence"] = {
            "enabled": False,
            "error": str(exc)[:500],
        }
    return payload


@router.get("/v1/transcription/source-data")
def transcription_source_data(request: Request, limit: int = 100):
    recordings = request.app.state.recording_store.list(limit=max(1, min(limit, 200)))
    projects = _build_projects(request.app)
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


@router.post("/v1/audio/transcriptions")
async def transcribe_upload(
    request: Request,
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
    vad_guided: str = Form(str(VAD_GUIDED_DEFAULT).lower()),
):
    started_at = time.perf_counter()
    is_streaming = str_to_bool(stream)
    target_model = model or request.app.state.default_model

    logger.info(f"[/v1/audio/transcriptions] Received upload request. File: '{file.filename}', Size: {file.size if file.size else 'unknown'} bytes, Model: '{target_model}', Stream: {is_streaming}")

    suffix = Path(file.filename or "audio").suffix or ".audio"

    try:
        with tempfile_NamedTemporaryFile_patch(suffix=suffix) as tmp_path:
            with open(tmp_path, "wb") as tmp:
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
                vad_guided=vad_guided,
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
                saved_meta = request.app.state.transcription_store.save(cached_res, audio_filename=file.filename, recording_id=recording_id)
                cached_res["saved_id"] = saved_meta["id"]
                cached_res["saved_file_path"] = str(request.app.state.transcription_store.root)

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
                            transcription_store=request.app.state.transcription_store,
                            started_at=started_at,
                            vad_guided=vad_guided,
                        ):
                            yield event
                    finally:
                        pass

                return StreamingResponse(event_generator_wrapper(), media_type="application/x-ndjson")

            logger.info(f"[/v1/audio/transcriptions] Running non-streaming transcription for {tmp_path} using {target_model}...")
            try:
                result = _transcribe_file(
                    request.app,
                    audio_path=tmp_path,
                    model=target_model,
                    language=language,
                    task=task,
                    word_timestamps=str_to_bool(word_timestamps),
                    initial_prompt=initial_prompt,
                    temperature=temperature,
                    condition_on_previous_text=str_to_bool(condition_on_previous_text, True),
                    verbose=None if verbose is None else str_to_bool(verbose),
                    vad_guided=str_to_bool(vad_guided, VAD_GUIDED_DEFAULT),
                )

                elapsed = time.perf_counter() - started_at
                logger.info(f"[/v1/audio/transcriptions] Transcription completed in {elapsed:.2f} seconds")

                payload = {
                    "text": result.get("text", ""),
                    "language": result.get("language", language),
                    "segments": result.get("segments", []),
                    "metadata": result.get("metadata", {}),
                    "model": target_model,
                    "backend": "mlx-whisper",
                    "recording_id": recording_id or "",
                    "stats": {
                        "time_total_seconds": elapsed,
                    },
                }
                payload = _clean_nan_values(payload)
                save_cached_result(cache_key, payload)

                saved_meta = request.app.state.transcription_store.save(payload, audio_filename=file.filename, recording_id=recording_id)
                payload["saved_id"] = saved_meta["id"]
                payload["saved_file_path"] = str(request.app.state.transcription_store.root)

                if response_format == "text":
                    return PlainTextResponse(payload["text"])

                if response_format == "verbose_json":
                    return JSONResponse(payload)

                return JSONResponse({"text": payload["text"]})
            finally:
                pass

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


@router.post("/v1/audio/transcriptions/path")
def transcribe_path(request: Request, body: TranscribePathRequest):
    started_at = time.perf_counter()
    target_model = body.model or request.app.state.default_model

    audio_path = Path(body.file).expanduser()
    logger.info(f"[/v1/audio/transcriptions/path] Received request for file: '{audio_path}', Model: '{target_model}'")

    if not audio_path.exists():
        logger.error(f"[/v1/audio/transcriptions/path] File not found: '{audio_path}'")
        raise HTTPException(
            status_code=404,
            detail=f"Audio file not found: {audio_path}",
        )

    try:
        result = _transcribe_file(
            request.app,
            audio_path=str(audio_path),
            model=target_model,
            language=body.language,
            task=body.task,
            word_timestamps=body.word_timestamps,
            initial_prompt=body.initial_prompt,
            temperature=body.temperature,
            condition_on_previous_text=body.condition_on_previous_text,
            verbose=body.verbose,
            vad_guided=body.vad_guided,
        )

        elapsed = time.perf_counter() - started_at
        logger.info(f"[/v1/audio/transcriptions/path] Finished processing. Time taken: {elapsed:.2f} seconds")

        payload = {
            "text": result.get("text", ""),
            "language": result.get("language", body.language),
            "segments": result.get("segments", []),
            "metadata": result.get("metadata", {}),
            "model": target_model,
            "backend": "mlx-whisper",
            "stats": {
                "time_total_seconds": elapsed,
            },
        }

        saved_meta = request.app.state.transcription_store.save(payload, audio_filename=audio_path.name)
        payload["saved_id"] = saved_meta["id"]
        payload["saved_file_path"] = str(request.app.state.transcription_store.root)

        if body.response_format == "text":
            return PlainTextResponse(payload["text"])

        if body.response_format == "verbose_json":
            return JSONResponse(payload)

        return JSONResponse({"text": payload["text"]})

    except Exception as exc:
        logger.error(f"[/v1/audio/transcriptions/path] Transcription failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {exc}",
        ) from exc
    finally:
        pass


@router.post("/v1/recordings/{recording_id}/transcriptions")
def transcribe_recording(recording_id: str, request: Request, body: TranscribeRecordingRequest):
    try:
        payload = run_recording_transcription(request.app, recording_id, body)
        if body.response_format == "text":
            return PlainTextResponse(payload["text"])
        return JSONResponse(payload)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc
    except RecordingConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(f"[/v1/recordings/{recording_id}/transcriptions] Transcription failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        pass


@router.post("/v1/recordings/{recording_id}/transcription-jobs", status_code=202)
def create_transcription_job(recording_id: str, request: Request, body: TranscriptionJobRequest):
    try:
        request.app.state.recording_store.get(recording_id, include_result=False)
    except RecordingNotFound as exc:
        raise HTTPException(status_code=404, detail="Recording not found") from exc

    def runner(job: TranscriptionJob) -> dict[str, Any]:
        try:
            return run_recording_transcription(request.app, recording_id, body, job)
        finally:
            pass

    return request.app.state.transcription_jobs.create(recording_id, runner)


@router.get("/v1/jobs")
def list_jobs(
    request: Request,
    type: str | None = Query(default=None),
    scope_type: str | None = Query(default=None),
    scope_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    return {
        "items": request.app.state.transcription_jobs.list(
            job_type=type,
            scope_type=scope_type,
            scope_id=scope_id,
            limit=limit,
        )
    }


@router.get("/v1/jobs/{job_id}")
def get_job(job_id: str, request: Request):
    job = request.app.state.transcription_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/v1/jobs/{job_id}/events")
def job_events(job_id: str, request: Request):
    if request.app.state.transcription_jobs.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    def event_stream():
        last_sequence = 0
        while True:
            if hasattr(request.app.state.transcription_jobs, "events_after"):
                events = request.app.state.transcription_jobs.events_after(job_id, last_sequence) or []
            else:
                events = request.app.state.transcription_jobs.drain_events(job_id) or []
            for event in events:
                last_sequence = max(last_sequence, int(event.get("sequence") or last_sequence))
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("status") in {"completed", "failed", "cancelled", "interrupted"}:
                    return
            time.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/v1/jobs/{job_id}/cancel")
def cancel_job(job_id: str, request: Request):
    existing = request.app.state.job_store.get(job_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Job not found")
    job = request.app.state.transcription_jobs.cancel(job_id) if existing["type"] == "transcription" else request.app.state.job_store.request_cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/v1/transcriptions/merge")
def merge_transcriptions(request: Request, body: MergeTranscriptionsRequest):
    try:
        return request.app.state.transcription_store.merge(
            transcription_ids=body.transcription_ids,
            title=body.title
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Merge failed: {exc}") from exc


@router.get("/v1/transcriptions")
def list_transcriptions(request: Request, page: int = 1, limit: int = 10):
    items, total = request.app.state.transcription_store.list(page=page, limit=limit)
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/v1/transcriptions/{transcription_id}")
def get_transcription(transcription_id: str, request: Request):
    try:
        return request.app.state.transcription_store.get(transcription_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Transcription not found")


@router.delete("/v1/transcriptions/{transcription_id}")
def delete_transcription(transcription_id: str, request: Request):
    success = request.app.state.transcription_store.delete(transcription_id)
    if not success:
        raise HTTPException(status_code=404, detail="Transcription not found")
    return {"ok": True}


@router.post("/v1/transcriptions/{transcription_id}/split")
def split_transcription(transcription_id: str, request: Request):
    try:
        restored_ids = request.app.state.transcription_store.split(transcription_id)
        return {"ok": True, "restored_ids": restored_ids}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


import tempfile
import contextlib

@contextlib.contextmanager
def tempfile_NamedTemporaryFile_patch(suffix=""):
    """Helper to handle temporary file path lifecycle cleanly."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        yield path
    finally:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass
