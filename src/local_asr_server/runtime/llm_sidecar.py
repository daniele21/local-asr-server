from __future__ import annotations

import importlib.util
import shutil
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

from local_asr_server.paths import get_service_log_file
from local_asr_server.runtime.models import LOCAL_SERVICE_HOST


class LocalLLMSidecarError(RuntimeError):
    """Raised when the managed local LLM service cannot become usable."""

    def __init__(self, code: str, message: str, status: int = 503) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class ResolvedReasoning:
    requested: str
    effective: str
    restart_required: bool = False


@dataclass(frozen=True)
class LocalLLMProcessConfig:
    model: str
    model_path: str = ""
    backend: str = ""
    mmproj_path: str = ""
    ctx_size: int | None = None
    startup_timeout: int | None = None
    llama_server_bin: str = ""


class LocalLLMSidecar:
    """Owns the process, port, readiness and logs for local-llm-server."""

    def __init__(self, log_file: Path | None = None) -> None:
        self.host = LOCAL_SERVICE_HOST
        self.log_file = log_file or get_service_log_file("llm-server", create_parent=False)
        self._process: subprocess.Popen[Any] | None = None
        self._port: int | None = None
        self._started_at: float | None = None
        self._last_error: str | None = None
        self._process_config: LocalLLMProcessConfig | None = None

    @property
    def base_url(self) -> str | None:
        if self._port is None:
            return None
        return f"http://{self.host}:{self._port}"

    def _query_health(self) -> dict[str, Any] | None:
        if not self.base_url:
            return None
        import json
        try:
            with urlopen(f"{self.base_url}/health", timeout=1.0) as response:
                if 200 <= response.status < 300:
                    return json.loads(response.read().decode("utf-8"))
        except Exception:
            pass
        return None

    def status(self, model: str, mode: str, model_path: str = "") -> dict[str, Any]:
        process = self._process
        health_data = self._query_health()

        if mode == "disabled":
            status = "not_configured"
        elif model == "custom" and not model_path:
            status = "model_missing"
        elif process is None:
            status = "stopped"
        elif process.poll() is not None:
            status = "crashed"
        elif health_data is not None:
            status = "ready"
        else:
            status = "loading_model"

        loaded_model = None
        loaded_model_id = None
        loaded_model_path = None
        loaded_model_backend = None
        if health_data:
            loaded_model = health_data.get("model_key") or health_data.get("model")
            loaded_model_id = health_data.get("model")
            loaded_model_path = health_data.get("model_path")
            loaded_model_backend = health_data.get("backend")

        return {
            "name": "llm",
            "status": status,
            "mode": mode,
            "model": model,
            "loaded_model": loaded_model,
            "loaded_model_id": loaded_model_id,
            "loaded_model_path": loaded_model_path,
            "loaded_model_backend": loaded_model_backend,
            "model_path_configured": bool(model_path),
            "managed": mode == "auto",
            "url": self.base_url,
            "host": self.host if self._port else None,
            "port": self._port,
            "pid": process.pid if process and process.poll() is None else None,
            "started_at": self._started_at,
            "log_file": str(self.log_file),
            "error": self._last_error,
        }

    def ensure_ready(
        self,
        *,
        model: str,
        model_path: str = "",
        backend: str = "",
        mmproj_path: str = "",
        ctx_size: int | None = None,
        startup_timeout: int | None = None,
        llama_server_bin: str = "",
        reasoning: str = "auto",
        capability: str = "text",
        timeout: float = 30.0,
    ) -> dict[str, Any]:
        if model == "custom" and not model_path:
            raise LocalLLMSidecarError("local_llm_model_missing", "Percorso modello LLM locale non configurato.", 400)
        if not self._runtime_available():
            raise LocalLLMSidecarError(
                "local_llm_binary_missing",
                "local-llm-server non è installato o non è importabile.",
                503,
            )
        config = LocalLLMProcessConfig(model, model_path, backend, mmproj_path, ctx_size, startup_timeout, llama_server_bin)
        if self._process is None or self._process.poll() is not None:
            self.start(**config.__dict__)
        elif self._process_config != config:
            self.restart(**config.__dict__)
        if not self.wait_until_ready(timeout=timeout):
            raise LocalLLMSidecarError("local_llm_not_ready", "Il servizio LLM locale è ancora in caricamento.", 503)
        resolved_reasoning = self.resolve_reasoning(reasoning, capability)
        return {
            "base_url": self.base_url,
            "model": model,
            "reasoning": resolved_reasoning.effective,
            "requested_reasoning": resolved_reasoning.requested,
            "restart_required": resolved_reasoning.restart_required,
        }

    def start(
        self,
        *,
        model: str,
        model_path: str = "",
        backend: str = "",
        mmproj_path: str = "",
        ctx_size: int | None = None,
        startup_timeout: int | None = None,
        llama_server_bin: str = "",
    ) -> dict[str, Any]:
        config = LocalLLMProcessConfig(model, model_path, backend, mmproj_path, ctx_size, startup_timeout, llama_server_bin)
        if self._process is not None and self._process.poll() is None:
            if self._process_config != config:
                return self.restart(**config.__dict__)
            return {"base_url": self.base_url, "pid": self._process.pid}

        if not self._runtime_available():
            raise LocalLLMSidecarError(
                "local_llm_binary_missing",
                "local-llm-server non è installato o non è importabile.",
                503,
            )
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        self._port = self._select_port()
        cmd = self._build_command(port=self._port, **config.__dict__)
        try:
            log_handle = self.log_file.open("ab")
            self._process = subprocess.Popen(cmd, stdout=log_handle, stderr=subprocess.STDOUT)
            self._started_at = time.time()
            self._last_error = None
            self._process_config = config
        except Exception as exc:
            self._last_error = str(exc)
            raise LocalLLMSidecarError("local_llm_start_failed", f"Avvio local-llm-server non riuscito: {exc}") from exc
        return {"base_url": self.base_url, "pid": self._process.pid}

    def stop(self, timeout: float = 5.0) -> dict[str, Any]:
        process = self._process
        if process is None:
            return {"stopped": True}
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=timeout)
        self._process = None
        self._port = None
        self._started_at = None
        self._process_config = None
        return {"stopped": True}

    def restart(self, **config: Any) -> dict[str, Any]:
        self.stop()
        return self.start(**config)

    def tail_logs(self, lines: int = 200) -> str:
        if not self.log_file.exists():
            return ""
        lines = max(1, min(lines, 2000))
        data = self.log_file.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(data[-lines:])

    def wait_until_ready(self, timeout: float = 30.0, interval: float = 0.5) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._process is not None and self._process.poll() is not None:
                self._last_error = f"local-llm-server exited with code {self._process.returncode}"
                return False
            if self.is_ready():
                return True
            time.sleep(interval)
        return False

    def is_ready(self) -> bool:
        if not self.base_url:
            return False
        try:
            with urlopen(f"{self.base_url}/health", timeout=1.0) as response:
                return 200 <= response.status < 300
        except (OSError, URLError, ValueError):
            return False

    def resolve_reasoning(self, reasoning: str, capability: str = "text") -> ResolvedReasoning:
        if reasoning not in {"auto", "on", "off"}:
            reasoning = "auto"
        if reasoning == "auto":
            return ResolvedReasoning(requested="auto", effective="off" if capability == "audio" else "auto")
        return ResolvedReasoning(requested=reasoning, effective=reasoning)

    def _runtime_available(self) -> bool:
        return bool(shutil.which("local-llm-server")) or importlib.util.find_spec("local_llm_server") is not None

    def _build_command(
        self,
        *,
        model: str,
        model_path: str,
        backend: str,
        mmproj_path: str,
        ctx_size: int | None,
        startup_timeout: int | None,
        llama_server_bin: str,
        port: int,
    ) -> list[str]:
        binary = shutil.which("local-llm-server")
        cmd = [binary, "serve"] if binary else [sys.executable, "-m", "local_llm_server", "serve"]
        cmd.extend(["--host", self.host, "--port", str(port)])
        if model != "custom":
            cmd.extend(["--model", model])
        if model_path:
            cmd.extend(["--model-path", model_path])
        if backend:
            cmd.extend(["--backend", backend])
        if mmproj_path:
            cmd.extend(["--mmproj-path", mmproj_path])
        if ctx_size is not None:
            cmd.extend(["--ctx-size", str(ctx_size)])
        if startup_timeout is not None:
            cmd.extend(["--startup-timeout", str(startup_timeout)])
        if llama_server_bin:
            cmd.extend(["--llama-server-bin", llama_server_bin])
        return cmd

    def _select_port(self) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind((self.host, 0))
            return int(sock.getsockname()[1])
