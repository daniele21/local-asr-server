from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from local_asr_server.runtime.models import DEFAULT_LOCAL_LLM_URL
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


class RuntimeServiceManager:
    """Owns local runtime service status without owning product workflows."""

    def __init__(self, llm_sidecar: LocalLLMSidecar | None = None) -> None:
        self.llm_sidecar = llm_sidecar or LocalLLMSidecar()

    def _llm_settings(self) -> dict[str, Any]:
        settings = load_settings()
        model = settings.get("local_llm_model") or "nemotron-nano-4b"
        model_paths = settings.get("local_llm_model_paths") or {}
        model_path = settings.get("local_llm_model_path") or model_paths.get(model) or ""
        return {
            "mode": settings.get("local_llm_mode", "auto"),
            "model": model,
            "model_path": model_path,
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
        if mode == "disabled":
            status = "not_configured"
        elif llm["model"] == "custom" and not llm["model_path"]:
            status = "model_missing"
        else:
            status = "stopped"

        return RuntimeServiceStatus(
            name="llm",
            status=status,
            details={
                "mode": mode,
                "model": llm["model"],
                "model_path_configured": bool(llm["model_path"]),
                "url": llm["url"] if mode == "external" else None,
                "managed": False,
            },
        ).public()

    def ensure_llm_ready(self, *, capability: str = "text", reasoning: str | None = None) -> dict[str, Any]:
        llm = self._llm_settings()
        mode = llm["mode"]
        if mode == "disabled":
            raise RuntimeError("local_llm_disabled")
        if mode == "external":
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
        )

    def start_llm(self) -> dict[str, Any]:
        llm = self._llm_settings()
        if llm["mode"] != "auto":
            return self.llm_status()
        return self.llm_sidecar.start(model=llm["model"], model_path=llm["model_path"], backend=llm["backend"], mmproj_path=llm["mmproj_path"], ctx_size=llm["ctx_size"], startup_timeout=llm["startup_timeout"], llama_server_bin=llm["llama_server_bin"])

    def stop_llm(self) -> dict[str, Any]:
        return self.llm_sidecar.stop()

    def restart_llm(self) -> dict[str, Any]:
        llm = self._llm_settings()
        if llm["mode"] != "auto":
            return self.llm_status()
        return self.llm_sidecar.restart(model=llm["model"], model_path=llm["model_path"], backend=llm["backend"], mmproj_path=llm["mmproj_path"], ctx_size=llm["ctx_size"], startup_timeout=llm["startup_timeout"], llama_server_bin=llm["llama_server_bin"])

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
