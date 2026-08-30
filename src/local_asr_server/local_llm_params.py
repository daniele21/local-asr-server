"""
local_llm_params.py — Manage parameter overrides for local-llm-server inference.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import yaml

from local_asr_server.paths import get_local_llm_params_file

logger = logging.getLogger("uvicorn.error")

DEFAULT_LOCAL_LLM_PARAMS: dict[str, Any] = {
    "models": {
        "nemotron-nano-4b-q8": {
            "params": {
                "ctx_size": 36466,
                "n_gpu_layers": 42
            }
        },
        "qwen3-vl-4b": {
            "params": {
                "max_kv_size": 8192,
                "startup_timeout": 300
            }
        }
    },
    "chat_params": {
        "temperature": 0.0,
        "max_tokens": 512,
        "shared_content_max_tokens": 768
    }
}


def _default_params_copy() -> dict[str, Any]:
    return {
        "models": {
            key: {**value, "params": dict(value.get("params") or {})}
            for key, value in DEFAULT_LOCAL_LLM_PARAMS["models"].items()
        },
        "chat_params": dict(DEFAULT_LOCAL_LLM_PARAMS["chat_params"]),
    }


def load_local_llm_params() -> dict[str, Any]:
    """Load ClosedRoom-owned local LLM inference overrides.

    If the config file does not exist, write the default template to disk.
    """
    params_file = get_local_llm_params_file()
    if not params_file.exists():
        try:
            params_file.parent.mkdir(parents=True, exist_ok=True)
            with open(params_file, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_LOCAL_LLM_PARAMS, f, indent=2, ensure_ascii=False)
        except Exception as exc:
            logger.warning("Failed to write default local-llm-params config: %s", exc)
        return _default_params_copy()

    try:
        with open(params_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            merged = _default_params_copy()
            if "models" in data and isinstance(data["models"], dict):
                # The file is the user-facing source of truth for model overrides.
                merged["models"] = data["models"]
            if "chat_params" in data and isinstance(data["chat_params"], dict):
                merged["chat_params"].update(data["chat_params"])
            return merged
    except Exception as exc:
        logger.warning("Failed to load local-llm-params config file: %s. Using defaults.", exc)

    return _default_params_copy()


def configure_local_llm_server_registry() -> Path:
    """Materialize ClosedRoom model overrides as an upstream registry overlay.

    ``local-llm-server`` 0.3.8 deliberately owns a YAML model registry, while
    ClosedRoom owns the user-facing ``local_llm_params.json`` configuration.
    The managed sidecar calls this adapter before invoking the pinned upstream
    CLI.  The real ``~/.local-llm/models.yaml`` is read as an input and is never
    modified.
    """
    import local_llm_server.registry as upstream_registry

    # A previous invocation in the same process may have pointed the upstream
    # module at our generated overlay. Always rebuild from the genuine upstream
    # user registry first.
    upstream_user_registry = Path.home() / ".local-llm" / "models.yaml"
    upstream_registry._USER_REGISTRY = upstream_user_registry
    registry = upstream_registry.load_registry()

    models: dict[str, Any] = {}
    for key, entry in (registry.get("models") or {}).items():
        copied = dict(entry)
        copied["params"] = dict(entry.get("params") or {})
        models[key] = copied

    configured = load_local_llm_params().get("models") or {}
    startup_models: list[str] = []
    if isinstance(configured, dict):
        for key, override in configured.items():
            if key not in models:
                logger.warning(
                    "Ignoring ClosedRoom override for unknown local LLM model: %s",
                    key,
                )
                continue
            params = override.get("params") if isinstance(override, dict) else None
            if isinstance(params, dict):
                models[key]["params"].update(params)
            startup_models.append(key)

    overlay = {
        "models_dir": str(registry["models_dir"]),
        "defaults": dict(registry.get("defaults") or {}),
        "models": models,
        "default_model": registry.get("default_model"),
        "startup_models": startup_models or list(registry.get("startup_models") or []),
    }
    adapter_file = get_local_llm_params_file().with_name("local_llm_registry.yaml")
    adapter_file.parent.mkdir(parents=True, exist_ok=True)
    temporary = adapter_file.with_suffix(".yaml.tmp")
    temporary.write_text(
        yaml.safe_dump(overlay, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    temporary.replace(adapter_file)
    adapter_file.chmod(0o600)

    # The CLI imports this same module object afterwards, so pointing it at the
    # generated overlay preserves per-model params without touching user files.
    upstream_registry._USER_REGISTRY = adapter_file
    return adapter_file
