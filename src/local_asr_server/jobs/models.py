from __future__ import annotations

TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled"}

JOB_STATUSES = {
    "queued",
    "running",
    "waiting_for_service",
    "cancel_requested",
    "cancelled",
    "completed",
    "failed",
    "retrying",
}

