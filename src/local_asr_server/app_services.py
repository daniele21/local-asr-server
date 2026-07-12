from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import FastAPI

    from local_asr_server.analysis_jobs import AnalysisJobManager
    from local_asr_server.catalog import CatalogStore
    from local_asr_server.jobs import JobStore
    from local_asr_server.native_capture import NativeCaptureManager
    from local_asr_server.recordings import RecordingStore
    from local_asr_server.runtime.service_manager import RuntimeServiceManager
    from local_asr_server.services.transcription_service import TranscriptionService
    from local_asr_server.transcription_jobs import TranscriptionJobManager
    from local_asr_server.transcriptions import TranscriptionStore


@dataclass(slots=True)
class AppServices:
    """Typed registry for the stateful services owned by one FastAPI app."""

    capture: NativeCaptureManager
    runtime: RuntimeServiceManager
    transcription: TranscriptionService
    catalog: CatalogStore
    jobs: JobStore
    transcription_jobs: TranscriptionJobManager
    analysis_jobs: AnalysisJobManager
    recordings: RecordingStore
    transcriptions: TranscriptionStore


_COMPATIBILITY_ALIASES = {
    "capture": "capture_manager",
    "runtime": "runtime_services",
    "transcription": "transcription_service",
    "catalog": "catalog_store",
    "jobs": "job_store",
    "transcription_jobs": "transcription_jobs",
    "analysis_jobs": "analysis_jobs",
    "recordings": "recording_store",
    "transcriptions": "transcription_store",
}


def get_services(app: FastAPI | Any) -> AppServices:
    """Return typed services while honoring temporary runtime alias overrides.

    The aliases remain during the incremental migration because tests and the
    native app replace selected collaborators after ``create_app``. Once those
    callers use this registry directly, the synchronization can be removed.
    """

    services: AppServices = app.state.services
    for field_name, alias in _COMPATIBILITY_ALIASES.items():
        override = getattr(app.state, alias, getattr(services, field_name))
        if override is not getattr(services, field_name):
            setattr(services, field_name, override)
    return services


def install_compatibility_aliases(app: FastAPI | Any, services: AppServices) -> None:
    """Expose legacy state names until native/test callers finish migrating."""

    app.state.services = services
    for field_name, alias in _COMPATIBILITY_ALIASES.items():
        value = getattr(services, field_name)
        if value is not None:
            setattr(app.state, alias, value)
