from __future__ import annotations

import os
from pathlib import Path


_LOADED = False


def _candidate_env_files() -> list[Path]:
    repo_root = Path(__file__).resolve().parents[2]
    candidates = [Path.cwd() / ".env", repo_root / ".env"]
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in candidates:
        resolved = path.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(resolved)
    return unique


def load_dotenv_once() -> None:
    """Load simple KEY=VALUE pairs from local .env files without overriding env."""
    global _LOADED
    if _LOADED:
        return
    _LOADED = True
    for path in _candidate_env_files():
        if not path.exists():
            continue
        try:
            for raw_line in path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if not key:
                    continue
                value = value.strip().strip("\"'")
                os.environ.setdefault(key, value)
        except OSError:
            continue


def get_env_var(name: str, default: str = "") -> str:
    """Return env value, accepting case-insensitive names from .env as fallback."""
    load_dotenv_once()
    value = os.environ.get(name)
    if value:
        return value
    upper_name = name.upper()
    for key, candidate in os.environ.items():
        if key.upper() == upper_name and candidate:
            return candidate
    return default
