"""
compile.py — Compile and cache the Swift Core Audio helper binary.

The helper source (``audio_helper.swift``) is compiled with ``swiftc``
and the resulting binary is stored in ``.cache/audio-helper/``.
Recompilation only happens when the source file changes (SHA-256 check).
"""

from __future__ import annotations

import hashlib
import logging
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger("uvicorn.error")

# Paths relative to this module
_MODULE_DIR = Path(__file__).parent
_SWIFT_SOURCE = _MODULE_DIR / "audio_helper.swift"

# Cache directory at the project root
_PROJECT_ROOT = _MODULE_DIR.parents[2]  # src/local_asr_server/macos_audio_helper -> project root
_CACHE_DIR = _PROJECT_ROOT / ".cache" / "audio-helper"
_BINARY_PATH = _CACHE_DIR / "audio-helper"
_HASH_PATH = _CACHE_DIR / "source.sha256"


def _swift_source_hash() -> str:
    """Compute SHA-256 of the Swift source file."""
    return hashlib.sha256(_SWIFT_SOURCE.read_bytes()).hexdigest()


def _is_binary_up_to_date() -> bool:
    """Check if the cached binary matches the current source."""
    if not _BINARY_PATH.exists() or not _HASH_PATH.exists():
        return False
    cached_hash = _HASH_PATH.read_text().strip()
    return cached_hash == _swift_source_hash()


def _find_swiftc() -> str | None:
    """Locate the Swift compiler."""
    import shutil
    path = shutil.which("swiftc")
    if path:
        return path

    # Xcode default location
    xcode_path = "/usr/bin/swiftc"
    if Path(xcode_path).exists():
        return xcode_path
    return None


def compile_helper(force: bool = False) -> str:
    """
    Compile the Swift helper binary if needed.

    Args:
        force: Recompile even if the cached binary is up to date.

    Returns:
        Absolute path to the compiled binary.

    Raises:
        RuntimeError: If the platform is not macOS, swiftc is missing,
            or the compilation fails.
    """
    if sys.platform != "darwin":
        raise RuntimeError(
            "The Core Audio helper is only available on macOS."
        )

    if not _SWIFT_SOURCE.exists():
        raise RuntimeError(
            f"Swift source not found: {_SWIFT_SOURCE}"
        )

    # Return cached binary when up to date
    if not force and _is_binary_up_to_date():
        logger.debug("Audio helper binary is up to date: %s", _BINARY_PATH)
        return str(_BINARY_PATH)

    # Locate the Swift compiler
    swiftc = _find_swiftc()
    if swiftc is None:
        raise RuntimeError(
            "Swift compiler (swiftc) not found. "
            "Install Xcode Command Line Tools: xcode-select --install"
        )

    # Ensure output directory exists
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Compile with optimisation
    logger.info("Compiling audio helper: %s -> %s", _SWIFT_SOURCE, _BINARY_PATH)
    cmd = [
        swiftc,
        "-O",                               # Release optimisation
        "-o", str(_BINARY_PATH),
        str(_SWIFT_SOURCE),
        "-framework", "CoreAudio",
        "-framework", "AudioToolbox",
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=60,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Swift compilation failed (exit {result.returncode}):\n"
            f"{result.stderr}"
        )

    # Save source hash for cache invalidation
    _HASH_PATH.write_text(_swift_source_hash())
    logger.info("Audio helper compiled successfully: %s", _BINARY_PATH)
    return str(_BINARY_PATH)


def get_helper_binary() -> str:
    """
    Get the path to the helper binary, compiling if necessary.

    This is the main entry point used by `AudioHelper.__init__`.
    """
    return compile_helper(force=False)
