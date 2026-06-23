from __future__ import annotations

TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled", "interrupted"}

JOB_STATUSES = {
    "queued",
    "running",
    "waiting_for_service",
    "cancel_requested",
    "cancelling",
    "cancelled",
    "interrupted",
    "completed",
    "failed",
    "retrying",
}
