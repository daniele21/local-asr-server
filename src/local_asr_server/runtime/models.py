from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


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


DEFAULT_LLM_QUALITY_PRESET: LLMQualityPreset = "balanced"
DEFAULT_LLM_REASONING: LLMReasoningPolicy = "auto"


@dataclass(frozen=True)
class AnalysisQualityDefaults:
    precise: float = 0.1
    balanced: float = 0.2
    creative: float = 0.5


ANALYSIS_QUALITY_DEFAULTS = AnalysisQualityDefaults()
