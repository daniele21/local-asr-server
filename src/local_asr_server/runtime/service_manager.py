from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from local_asr_server.runtime.models import (
    DEFAULT_LOCAL_LLM_URL,
    is_local_llm_model_path_explicit,
    resolve_local_llm_model_path,
)
from local_asr_server.runtime.llm_sidecar import LocalLLMSidecar
from local_asr_server.settings import load_settings


@dataclass
class RuntimeServiceStatus:
    name: str
    status: str
    details: dict[str, Any]

    def public(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status,
            **self.details,
        }


def _query_external_health(url: str) -> dict[str, Any] | None:
    from urllib.request import urlopen
    import json
    try:
        with urlopen(f"{url.rstrip('/')}/health", timeout=1.0) as response:
            if 200 <= response.status < 300:
                return json.loads(response.read().decode("utf-8"))
    except Exception:
        pass
    return None


class RuntimeServiceManager:
    """Owns local runtime service status without owning product workflows."""

    def __init__(self, llm_sidecar: LocalLLMSidecar | None = None) -> None:
        self.llm_sidecar = llm_sidecar or LocalLLMSidecar()

    def _llm_settings(self, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        settings = load_settings()
        if overrides:
            settings = {
                **settings,
                **{
                    key: value
                    for key, value in overrides.items()
                    if value is not None and not (isinstance(value, str) and not value.strip())
                },
            }
        model = settings.get("local_llm_model") or "nemotron-nano-4b-q8"
        model_path = resolve_local_llm_model_path(settings, model)
        dynamic_residency = not is_local_llm_model_path_explicit(settings, model)
        return {
            "mode": settings.get("local_llm_mode", "auto"),
            "model": model,
            "model_path": model_path,
            "dynamic_residency": dynamic_residency,
            "url": settings.get("local_llm_url") or DEFAULT_LOCAL_LLM_URL,
            "reasoning": settings.get("local_llm_reasoning") or "auto",
            "backend": settings.get("local_llm_backend") or "",
            "mmproj_path": settings.get("local_llm_mmproj_path") or "",
            "ctx_size": settings.get("local_llm_ctx_size"),
            "startup_timeout": settings.get("local_llm_startup_timeout"),
            "llama_server_bin": settings.get("local_llm_llama_server_bin") or "",
        }

    def llm_status(self) -> dict[str, Any]:
        llm = self._llm_settings()
        mode = llm["mode"]

        if mode == "auto":
            return self.llm_sidecar.status(llm["model"], mode, llm["model_path"])

        health_data = None
        if mode == "external" and llm["url"]:
            health_data = _query_external_health(llm["url"])

        if mode == "disabled":
            status = "not_configured"
        elif health_data is not None:
            status = "ready"
        else:
            status = "stopped"

        loaded_model = None
        loaded_model_id = None
        loaded_model_path = None
        loaded_model_backend = None
        if health_data:
            loaded_model = health_data.get("model_key") or health_data.get("model")
            loaded_model_id = health_data.get("model")
            loaded_model_path = health_data.get("model_path")
            loaded_model_backend = health_data.get("backend")

        return RuntimeServiceStatus(
            name="llm",
            status=status,
            details={
                "mode": mode,
                "model": llm["model"],
                "loaded_model": loaded_model,
                "loaded_model_id": loaded_model_id,
                "loaded_model_path": loaded_model_path,
                "loaded_model_backend": loaded_model_backend,
                "model_path_configured": bool(llm["model_path"]),
                "url": llm["url"] if mode == "external" else None,
                "managed": False,
            },
        ).public()

    def ensure_llm_ready(
        self, *, capability: str = "text", reasoning: str | None = None,
        overrides: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        from local_asr_server.runtime.leases import ModelRuntimeLeaseManager
        lease_type = "vision" if capability == "image" else "llm"
        ModelRuntimeLeaseManager.acquire_lease(lease_type)
        llm = self._llm_settings(overrides)
        mode = llm["mode"]
        if mode == "disabled":
            raise RuntimeError("local_llm_disabled")
        if mode == "external":
            health = _query_external_health(llm["url"])
            if health is None:
                raise RuntimeError(f"external_llm_server_not_reachable: {llm['url']}")
            return {
                "base_url": llm["url"],
                "model": llm["model"],
                "reasoning": reasoning or llm["reasoning"],
                "requested_reasoning": reasoning or llm["reasoning"],
                "restart_required": False,
            }
        return self.llm_sidecar.ensure_ready(
            model=llm["model"],
            model_path=llm["model_path"],
            backend=llm["backend"],
            mmproj_path=llm["mmproj_path"],
            ctx_size=llm["ctx_size"],
            startup_timeout=llm["startup_timeout"],
            llama_server_bin=llm["llama_server_bin"],
            reasoning=reasoning or llm["reasoning"],
            capability=capability,
            dynamic_residency=llm["dynamic_residency"],
        )

    def release_llm_residency(
        self, *, overrides: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Release heavy local LLM/VLM residency after one logical phase.

        Only the process owned by ClosedRoom in ``auto`` mode may be
        mutated. External endpoints remain entirely caller-owned.
        """
        from local_asr_server.runtime.leases import ModelRuntimeLeaseManager

        settings = self._llm_settings(overrides)
        ModelRuntimeLeaseManager.release_lease("vision")
        ModelRuntimeLeaseManager.release_lease("llm")
        if settings["mode"] != "auto":
            return {"released": False, "reason": "not_managed"}
        return self.llm_sidecar.release_resident_models()

    def start_llm(self) -> dict[str, Any]:
        llm = self._llm_settings()
        if llm["mode"] != "auto":
            return self.llm_status()
        return self.llm_sidecar.start(model=llm["model"], model_path=llm["model_path"], backend=llm["backend"], mmproj_path=llm["mmproj_path"], ctx_size=llm["ctx_size"], startup_timeout=llm["startup_timeout"], llama_server_bin=llm["llama_server_bin"], dynamic_residency=llm["dynamic_residency"])

    def stop_llm(self) -> dict[str, Any]:
        return self.llm_sidecar.stop()

    def restart_llm(self) -> dict[str, Any]:
        llm = self._llm_settings()
        if llm["mode"] != "auto":
            return self.llm_status()
        return self.llm_sidecar.restart(model=llm["model"], model_path=llm["model_path"], backend=llm["backend"], mmproj_path=llm["mmproj_path"], ctx_size=llm["ctx_size"], startup_timeout=llm["startup_timeout"], llama_server_bin=llm["llama_server_bin"], dynamic_residency=llm["dynamic_residency"])

    def llm_logs(self, tail: int = 200) -> dict[str, Any]:
        return {"service": "llm", "tail": tail, "text": self.llm_sidecar.tail_logs(tail)}

    def status(self) -> dict[str, Any]:
        return {
            "services": {
                "llm": self.llm_status(),
            }
        }

    def shutdown(self) -> None:
        """Stop managed runtime sidecars owned by this API process."""
        llm = self._llm_settings()
        if llm["mode"] == "auto":
            self.llm_sidecar.stop()
