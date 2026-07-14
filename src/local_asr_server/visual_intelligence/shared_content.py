from __future__ import annotations

from typing import Any

from local_asr_server.visual_intelligence.contracts import VisualRoutingConfig, VisualTrigger


CONTENT_TYPE_ALIASES = {
    "slides": "slide",
    "presentation": "slide",
    "deck": "slide",
    "doc": "document",
    "sheet": "spreadsheet",
    "table": "spreadsheet",
    "source_code": "code",
    "web": "browser",
}
SUPPORTED_CONTENT_TYPES = frozenset({
    "slide", "document", "spreadsheet", "code", "browser", "video", "dashboard", "unknown",
})


def normalize_content_type(value: Any) -> str:
    normalized = str(value or "unknown").strip().lower().replace(" ", "_")
    normalized = CONTENT_TYPE_ALIASES.get(normalized, normalized)
    return normalized if normalized in SUPPORTED_CONTENT_TYPES else "unknown"


def cadence_seconds(content_type: Any, config: VisualRoutingConfig) -> float:
    cadence = dict(config.shared_content_cadence_seconds)
    return float(cadence.get(normalize_content_type(content_type), cadence["unknown"]))


def should_infer_shared_candidate(
    *, trigger: str, timestamp: float, last_inference_timestamp: float | None,
    content_type: Any, config: VisualRoutingConfig,
) -> bool:
    if last_inference_timestamp is None or trigger != VisualTrigger.HEARTBEAT.value:
        return True
    return timestamp - last_inference_timestamp >= cadence_seconds(content_type, config)
