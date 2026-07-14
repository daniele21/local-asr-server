from __future__ import annotations

from pathlib import Path

from local_asr_server.settings import DEFAULT_SETTINGS


def deterministic_settings(root: Path, **overrides):
    """Return machine-independent settings for API/store integration tests."""
    settings = {
        **DEFAULT_SETTINGS,
        "transcriptions_dir": str(root / "transcriptions"),
        "recordings_dir": str(root / "recordings"),
        "gemini_api_key": "",
        "speechmatics_api_key": "",
        "llm_provider": "mock",
        "local_llm_mode": "external",
        "local_llm_url": "http://127.0.0.1:1235",
        "local_llm_model": "test-model",
        "default_model": "test-model",
    }
    settings.update(overrides)
    return settings
