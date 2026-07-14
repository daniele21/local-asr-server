from __future__ import annotations

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys


_MODULE_DIR = Path(__file__).parent
_PROJECT_ROOT = _MODULE_DIR.parents[2]
_CACHE_DIR = _PROJECT_ROOT / ".cache" / "speaker-diarization-helper"
_BINARY_PATH = _CACHE_DIR / "speaker-diarization-helper"
_HASH_PATH = _CACHE_DIR / "source.sha256"


def _source_hash() -> str:
    digest = hashlib.sha256()
    for path in sorted([_MODULE_DIR / "Package.swift", *(_MODULE_DIR / "Sources").glob("*.swift")]):
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def compile_helper(force: bool = False) -> str:
    if sys.platform != "darwin":
        raise RuntimeError("FluidAudio diarization is only available on macOS.")
    if not force and _BINARY_PATH.exists() and _HASH_PATH.exists():
        if _HASH_PATH.read_text(encoding="utf-8").strip() == _source_hash():
            return str(_BINARY_PATH)
    swift = shutil.which("swift")
    if swift is None:
        raise RuntimeError("Swift toolchain not found. Install Xcode Command Line Tools.")
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    scratch = _CACHE_DIR / "build"
    result = subprocess.run(
        [swift, "build", "-c", "release", "--package-path", str(_MODULE_DIR), "--scratch-path", str(scratch)],
        capture_output=True,
        text=True,
        timeout=1800,
        env={**os.environ, "CLANG_MODULE_CACHE_PATH": str(_CACHE_DIR / "clang-module-cache")},
    )
    if result.returncode != 0:
        raise RuntimeError(f"Speaker diarization helper compilation failed:\n{result.stderr}")
    built = scratch / "release" / "closedroom-speaker-diarizer"
    if not built.exists():
        raise RuntimeError(f"Compiled speaker diarization helper not found: {built}")
    shutil.copy2(built, _BINARY_PATH)
    _BINARY_PATH.chmod(0o755)
    _HASH_PATH.write_text(_source_hash(), encoding="utf-8")
    return str(_BINARY_PATH)


def get_helper_binary() -> str:
    from local_asr_server.paths import get_speaker_diarization_helper_path, is_bundled

    path = get_speaker_diarization_helper_path()
    if is_bundled():
        if not path.exists():
            raise RuntimeError(f"Bundled speaker diarization helper not found: {path}")
        return str(path)
    return compile_helper()
