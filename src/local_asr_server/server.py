from __future__ import annotations

import os
import hmac
import secrets
import tempfile
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from local_asr_server.analysis_jobs import AnalysisJobManager
from local_asr_server.audio_router import AudioRouter
from local_asr_server.catalog import CatalogStore
from local_asr_server.jobs import JobStore
from local_asr_server.native_capture import NativeCaptureManager
from local_asr_server.recordings import RecordingStore
from local_asr_server.transcription_jobs import TranscriptionJobManager
from local_asr_server.paths import get_static_dir
from local_asr_server.runtime.service_manager import RuntimeServiceManager
from local_asr_server.services.transcription_service import TranscriptionService
from local_asr_server.transcriber import transcribe_file_sync

from local_asr_server.routers.helpers import (
    _env_bool,
    _parse_allowed_origins,
    _extract_bearer_token,
)
from local_asr_server.routers import recordings, transcriptions, system

PUBLIC_AUTH_PATHS = {
    "/",
    "/health",
    "/v1/session",
    "/favicon.svg",
    "/logo.svg",
    "/logo-dark.svg",
    "/logo-light.svg",
}


def create_app(
    default_model: str = "mlx-community/whisper-large-v3-turbo",
    recordings_dir: Path | None = None,
    *,
    enable_auth: bool | None = None,
    allowed_origins: list[str] | None = None,
) -> FastAPI:
    app = FastAPI(
        title="ClosedRoom",
        version="0.1.0",
        description="Local ASR transcription server powered by MLX Whisper.",
    )

    cors_origins = allowed_origins if allowed_origins is not None else _parse_allowed_origins(os.environ.get("LOCAL_ASR_ALLOWED_ORIGINS"))
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["Authorization", "Content-Type"],
        )

    app.state.default_model = default_model
    app.state.capture_manager = NativeCaptureManager()
    app.state.runtime_services = RuntimeServiceManager()
    app.state.transcription_service = TranscriptionService()
    app.state.auth_enabled = _env_bool("LOCAL_ASR_REQUIRE_AUTH", True) if enable_auth is None else enable_auth
    app.state.api_token = os.environ.get("LOCAL_ASR_API_TOKEN") or secrets.token_urlsafe(32)
    
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
    app.state.prompts_file = catalog_path.parent / "prompts.json" if temp_root in catalog_path.resolve().parents else None
    app.state.job_store = JobStore(catalog_path)
    interrupted_jobs = app.state.job_store.interrupt_incomplete()
    app.state.catalog_store.interrupt_analysis_runs_for_jobs(
        [job["id"] for job in interrupted_jobs if job["type"] == "analysis"],
        reason="Interrupted by server restart",
    )
    app.state.transcription_jobs = TranscriptionJobManager(app.state.job_store)
    app.state.analysis_jobs = AnalysisJobManager(app.state, app.state.job_store)
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

    @app.middleware("http")
    async def require_local_auth(request: Request, call_next):
        if (
            not app.state.auth_enabled
            or request.url.path in PUBLIC_AUTH_PATHS
            or request.url.path.startswith("/static/")
            or request.url.path.startswith("/public/")
            or request.url.path.startswith("/assets/")
        ):
            return await call_next(request)
        token = (
            _extract_bearer_token(request.headers.get("authorization"))
            or request.cookies.get("closedroom_session")
        )
        if not token or not hmac.compare_digest(token, app.state.api_token):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)

    @app.get("/")
    def read_index() -> FileResponse:
        return FileResponse(
            static_dir / "index.html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
        )

    # Include routers
    app.include_router(recordings.router)
    app.include_router(transcriptions.router)
    app.include_router(system.router)

    # Mount root static files at the end so it doesn't override API routes
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="root_static")

    return app
