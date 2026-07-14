from __future__ import annotations

import sys
from typing import Any


def accessibility_status() -> dict[str, Any]:
    """Return the effective macOS Accessibility permission for this process."""
    if sys.platform != "darwin":
        return {
            "available": False,
            "trusted": False,
            "required_for": ["global_hotkeys"],
            "reason": "macos_required",
        }

    try:
        from ApplicationServices import AXIsProcessTrusted

        trusted = bool(AXIsProcessTrusted())
        return {
            "available": True,
            "trusted": trusted,
            "required_for": ["global_hotkeys"],
            "reason": None if trusted else "accessibility_permission_required",
        }
    except Exception as exc:
        return {
            "available": False,
            "trusted": False,
            "required_for": ["global_hotkeys"],
            "reason": "accessibility_status_unavailable",
            "error": str(exc),
        }
