from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


LOCAL_SERVICE_HOST = "127.0.0.1"
DEFAULT_API_PORT = 1236
DEFAULT_DEV_RELOAD_PORT = 1237
DEFAULT_LOCAL_LLM_PORT = 1235
DEFAULT_LOCAL_LLM_URL = f"http://{LOCAL_SERVICE_HOST}:{DEFAULT_LOCAL_LLM_PORT}"

SERVICE_STATUSES = {
    "not_configured",
    "binary_missing",
    "model_missing",
    "stopped",
    "starting",
    "loading_model",
    "ready",
    "busy",
    "failed",
    "crashed",
    "stopping",
    "unknown",
}

LocalLLMMode = Literal["auto", "external", "disabled"]
LLMQualityPreset = Literal["precise", "balanced", "creative"]
LLMReasoningPolicy = Literal["auto", "on", "off"]

LOCAL_LLM_MODES = frozenset({"auto", "external", "disabled"})
LLM_QUALITY_PRESETS = frozenset({"precise", "balanced", "creative"})
LLM_REASONING_POLICIES = frozenset({"auto", "on", "off"})


DEFAULT_LLM_QUALITY_PRESET: LLMQualityPreset = "balanced"
DEFAULT_LLM_REASONING: LLMReasoningPolicy = "auto"


@dataclass(frozen=True)
class AnalysisQualityDefaults:
    precise: float = 0.1
    balanced: float = 0.2
    creative: float = 0.5


ANALYSIS_QUALITY_DEFAULTS = AnalysisQualityDefaults()


def resolve_local_llm_model_path(settings: dict[str, Any], model: str | None = None) -> str:
    """Resolve model-specific paths before the legacy global model path."""

    selected_model = model or settings.get("local_llm_model") or ""
    model_paths = settings.get("local_llm_model_paths") or {}
    if not isinstance(model_paths, dict):
        model_paths = {}
    return model_paths.get(selected_model) or settings.get("local_llm_model_path") or ""
