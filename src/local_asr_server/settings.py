"""
settings.py — User settings persistence for ClosedRoom.

Settings are stored in ``~/Library/Application Support/ClosedRoom/settings.json``
following the macOS convention for user data.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from local_asr_server.paths import get_settings_file, APP_NAME
from local_asr_server.runtime.models import (
    DEFAULT_LOCAL_LLM_URL,
    DEFAULT_LLM_QUALITY_PRESET,
    DEFAULT_LLM_REASONING,
)


# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_SETTINGS: dict[str, any] = {
    "transcriptions_dir": str(Path(f"~/Transcriptions/{APP_NAME}").expanduser()),
    "recordings_dir": str(Path(f"~/Recordings/{APP_NAME}").expanduser()),
    "gemini_api_key": "",
    "llm_provider": "mock",
    "default_model": "",
    "default_language": "it",
    "default_task": "transcribe",
    "default_temperature": "",
    "default_word_timestamps": False,
    "default_condition_on_previous": True,
    "local_llm_mode": "auto",
    "local_llm_url": DEFAULT_LOCAL_LLM_URL,
    "local_llm_model": "nemotron-nano-4b",
    "local_llm_quality_preset": DEFAULT_LLM_QUALITY_PRESET,
    "local_llm_temperature": None,
    "local_llm_reasoning": DEFAULT_LLM_REASONING,
    "local_llm_max_output_tokens": None,
    "local_llm_json_mode": True,
    "local_llm_model_path": "",
    "local_llm_model_paths": {},
}


# ── Public API ────────────────────────────────────────────────────────────────

def load_settings() -> dict[str, any]:
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


def save_settings(settings: dict[str, any]) -> None:
    """
    Persist settings to disk atomically.

    The parent directory is created if it does not exist.
    """
    settings_file = get_settings_file()
    settings_file.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(prefix=f".{settings_file.name}.", suffix=".tmp", dir=settings_file.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary_path, settings_file)
    except Exception:
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise
