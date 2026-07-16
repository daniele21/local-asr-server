"""
local_llm_params.py — Manage parameter overrides for local-llm-server inference.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

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


def load_local_llm_params() -> dict[str, Any] :
    """
    Load inference parameters for local-llm-server from disk.
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
        return DEFAULT_LOCAL_LLM_PARAMS.copy()

    try:
        with open(params_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            # Safe deep merge of DEFAULT_LOCAL_LLM_PARAMS and custom data
            merged = {
                "models": DEFAULT_LOCAL_LLM_PARAMS["models"].copy(),
                "chat_params": DEFAULT_LOCAL_LLM_PARAMS["chat_params"].copy()
            }
            if "models" in data and isinstance(data["models"], dict):
                # Replace/update models entirely if the user supplied them
                merged["models"] = data["models"]
            if "chat_params" in data and isinstance(data["chat_params"], dict):
                merged["chat_params"].update(data["chat_params"])
            return merged
    except Exception as exc:
        logger.warning("Failed to load local-llm-params config file: %s. Using defaults.", exc)

    return DEFAULT_LOCAL_LLM_PARAMS.copy()

