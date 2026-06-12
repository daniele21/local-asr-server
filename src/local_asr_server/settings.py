from __future__ import annotations

import json
from pathlib import Path

SETTINGS_FILE = Path("~/.config/local-asr/settings.json").expanduser()

DEFAULT_SETTINGS = {
    "transcriptions_dir": str(Path("~/Transcriptions/local-asr").expanduser()),
    "recordings_dir": str(Path("~/Recordings/local-asr").expanduser()),
    "gemini_api_key": "",
    "llm_provider": "mock"
}

def load_settings() -> dict[str, str]:
    if not SETTINGS_FILE.exists():
        return DEFAULT_SETTINGS.copy()
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Merge with defaults to ensure all fields exist
            return {**DEFAULT_SETTINGS, **data}
    except Exception:
        return DEFAULT_SETTINGS.copy()

def save_settings(settings: dict[str, str]) -> None:
    try:
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
