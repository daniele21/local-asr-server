from __future__ import annotations

import logging
from threading import Lock
from typing import Any

logger = logging.getLogger("uvicorn.error")


class ModelRuntimeLeaseManager:
    """Manages mutual exclusion of memory-heavy ML workloads on Apple Silicon."""

    _lock = Lock()
    _active_lease: str | None = None
    _service_manager: Any = None

    @classmethod
    def set_service_manager(cls, manager: Any) -> None:
        cls._service_manager = manager

    @classmethod
    def acquire_lease(cls, lease_type: str) -> None:
        """Acquire lease for a specific heavy ML execution type (asr, diarization, vision, llm)."""
        with cls._lock:
            logger.info("[Model Lease] Requesting lease for: %s (current: %s)", lease_type, cls._active_lease)
            
            # If the requested lease is ASR or Diarization, and the VLM/LLM sidecar is running,
            # we shut it down to free up memory before running the new workload.
            if lease_type in ("asr", "diarization"):
                if cls._service_manager:
                    status = cls._service_manager.llm_status()
                    if status.get("status") in ("ready", "running"):
                        logger.info("[Model Lease] Stopping VLM/LLM sidecar to free up unified memory for %s", lease_type)
                        try:
                            cls._service_manager.stop_llm()
                        except Exception as e:
                            logger.warning("[Model Lease] Failed to stop LLM sidecar: %s", e)
            
            cls._active_lease = lease_type

    @classmethod
    def release_lease(cls, lease_type: str) -> None:
        """Release the acquired lease."""
        with cls._lock:
            if cls._active_lease == lease_type:
                logger.info("[Model Lease] Released lease for: %s", lease_type)
                cls._active_lease = None
