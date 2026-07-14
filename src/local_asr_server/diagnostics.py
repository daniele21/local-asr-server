from __future__ import annotations

import json
import logging
import re
from typing import Any, Iterable

DIAGNOSTIC_STATUSES = frozenset(
    {"completed", "completed_with_warnings", "degraded", "failed", "disabled", "skipped"}
)
WARNING_STATUSES = frozenset({"completed_with_warnings", "degraded", "failed"})
_SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization:\s*bearer\s+)[^\s]+"),
    re.compile(r"(?i)((?:api[_-]?key|token|secret|password)[=:]\s*)[^\s,;]+"),
)


def redact_diagnostic_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)[:1000]
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(r"\1[REDACTED]", text)
    return text


def diagnostic(
    component: str,
    status: str,
    *,
    requested_backend: str | None = None,
    actual_backend: str | None = None,
    fallback_used: bool = False,
    fallback_reason: str | None = None,
    error: str | None = None,
    counts: dict[str, Any] | None = None,
    duration_seconds: float | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the shared, JSON-safe diagnostic contract used by API, UI and CLI."""
    if status not in DIAGNOSTIC_STATUSES:
        raise ValueError(f"Unsupported diagnostic status: {status}")
    return {
        "component": component,
        "status": status,
        "requested_backend": requested_backend,
        "actual_backend": actual_backend,
        "fallback_used": bool(fallback_used),
        "fallback_reason": fallback_reason,
        "error": redact_diagnostic_text(error)[:500] if error else None,
        "counts": counts or {},
        "duration_seconds": round(float(duration_seconds), 3) if duration_seconds is not None else None,
        "details": details or {},
    }


def log_diagnostic(
    logger: logging.Logger,
    item: dict[str, Any],
    *,
    recording_id: str,
    job_id: str | None = None,
) -> None:
    """Write a safe, correlatable component outcome without input or transcript content."""
    safe = {
        "event": "component_outcome",
        "recording_id": recording_id,
        "job_id": job_id,
        "component": item.get("component"),
        "status": item.get("status"),
        "requested_backend": item.get("requested_backend"),
        "actual_backend": item.get("actual_backend"),
        "fallback_used": bool(item.get("fallback_used")),
        "fallback_reason": redact_diagnostic_text(item.get("fallback_reason")),
        "error": redact_diagnostic_text(item.get("error")),
        "counts": item.get("counts") or {},
        "duration_seconds": item.get("duration_seconds"),
    }
    level = logging.WARNING if item.get("status") in WARNING_STATUSES or item.get("fallback_used") else logging.INFO
    logger.log(level, json.dumps(safe, ensure_ascii=False, sort_keys=True))


def outcome_status(items: Iterable[dict[str, Any]]) -> str:
    diagnostics = list(items)
    if any(item.get("status") in WARNING_STATUSES or item.get("fallback_used") for item in diagnostics):
        return "completed_with_warnings"
    return "completed"


def attach_diagnostics(payload: dict[str, Any], items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    normalized = list(items)
    outcome = outcome_status(normalized)
    payload["diagnostics"] = normalized
    payload["outcome_status"] = outcome
    stats = payload.setdefault("stats", {})
    stats["diagnostics"] = normalized
    stats["outcome_status"] = outcome
    return payload
