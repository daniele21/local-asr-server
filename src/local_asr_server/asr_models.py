"""ASR model capabilities and runtime selection.

This module is the backend source of truth for choosing the compatible MLX
runtime from the selected model repository.
"""

from __future__ import annotations

from typing import Final


NEMOTRON_STREAMING_MODEL: Final = "mlx-community/nemotron-3.5-asr-streaming-0.6b"
WHISPER_BACKEND: Final = "mlx-whisper"
NEMOTRON_BACKEND: Final = "mlx-audio-nemotron"

# The UI has historically used Whisper language codes. Nemotron expects BCP-47
# prompt keys, so translate the shared API values at the runtime boundary.
NEMOTRON_LANGUAGE_KEYS: Final = {
    "it": "it-IT",
    "en": "en-US",
    "es": "es-ES",
    "fr": "fr-FR",
    "de": "de-DE",
}


def is_nemotron_model(model: str) -> bool:
    return model == NEMOTRON_STREAMING_MODEL


def get_asr_backend(model: str) -> str:
    return NEMOTRON_BACKEND if is_nemotron_model(model) else WHISPER_BACKEND


def resolve_nemotron_language(language: str | None) -> str | None:
    """Return Nemotron's prompt key, preserving explicit BCP-47 values."""
    if not language:
        return None
    return NEMOTRON_LANGUAGE_KEYS.get(language, language)
