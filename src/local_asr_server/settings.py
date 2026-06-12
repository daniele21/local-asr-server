"""
settings.py — User settings persistence for ClosedRoom.

Settings are stored in ``~/Library/Application Support/ClosedRoom/settings.json``
following the macOS convention for user data.
"""

from __future__ import annotations

import json
from pathlib import Path

from local_asr_server.paths import get_settings_file, APP_NAME


# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_SETTINGS: dict[str, str] = {
    "transcriptions_dir": str(Path(f"~/Transcriptions/{APP_NAME}").expanduser()),
    "recordings_dir": str(Path(f"~/Recordings/{APP_NAME}").expanduser()),
    "gemini_api_key": "",
    "llm_provider": "mock",
}


# ── Public API ────────────────────────────────────────────────────────────────

def load_settings() -> dict[str, str]:
    """
    Load settings from disk, merging with defaults for missing keys.

    Returns a copy of the merged settings dict so callers cannot mutate the
    internal state accidentally.
    """
    settings_file = get_settings_file()
    if not settings_file.exists():
        return DEFAULT_SETTINGS.copy()
    try:
        with open(settings_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Merge: defaults first, then on-disk values override
        return {**DEFAULT_SETTINGS, **data}
    except Exception:
        return DEFAULT_SETTINGS.copy()


def save_settings(settings: dict[str, str]) -> None:
    """
    Persist settings to disk atomically.

    The parent directory is created if it does not exist.  Errors are
    silently swallowed so a settings failure never crashes the server.
    """
    try:
        settings_file = get_settings_file()
        settings_file.parent.mkdir(parents=True, exist_ok=True)
        with open(settings_file, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
