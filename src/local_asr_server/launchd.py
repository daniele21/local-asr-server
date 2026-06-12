"""
launchd.py — macOS LaunchAgent management for ClosedRoom.

Creates and removes a launchd plist so ClosedRoom.app launches automatically
when the user logs in.

The plist is installed at::

    ~/Library/LaunchAgents/com.closedroom.app.plist

Usage::

    from local_asr_server.launchd import install_launch_agent, uninstall_launch_agent
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from local_asr_server.paths import APP_BUNDLE_ID

# ── Constants ─────────────────────────────────────────────────────────────────

_LAUNCH_AGENTS_DIR = Path.home() / "Library" / "LaunchAgents"
_PLIST_PATH = _LAUNCH_AGENTS_DIR / f"{APP_BUNDLE_ID}.plist"

# Path to the .app bundle (resolved at install time)
_APP_PATHS = [
    Path("/Applications/ClosedRoom.app"),
    Path.home() / "Applications" / "ClosedRoom.app",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _find_app_binary() -> Path | None:
    """Locate the ClosedRoom.app binary in standard locations."""
    for app in _APP_PATHS:
        binary = app / "Contents" / "MacOS" / "ClosedRoom"
        if binary.exists():
            return binary
    return None


def _generate_plist(binary_path: Path) -> str:
    """Generate the launchd plist XML content."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{APP_BUNDLE_ID}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{binary_path}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>{Path.home()}/Library/Logs/ClosedRoom/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>{Path.home()}/Library/Logs/ClosedRoom/stderr.log</string>
</dict>
</plist>
"""


def _ensure_log_dir() -> None:
    """Create the log directory used by the LaunchAgent."""
    log_dir = Path.home() / "Library" / "Logs" / "ClosedRoom"
    log_dir.mkdir(parents=True, exist_ok=True)


# ── Public API ────────────────────────────────────────────────────────────────

def is_launch_agent_installed() -> bool:
    """Return True if the LaunchAgent plist exists on disk."""
    return _PLIST_PATH.exists()


def install_launch_agent(app_binary: Path | None = None) -> Path:
    """
    Install the LaunchAgent plist so ClosedRoom starts at login.

    Args:
        app_binary: Path to the ClosedRoom binary inside the .app bundle.
            Auto-detected if None.

    Returns:
        The path to the installed plist file.

    Raises:
        FileNotFoundError: If the .app bundle cannot be found automatically.
        RuntimeError: If not on macOS.
    """
    if sys.platform != "darwin":
        raise RuntimeError("LaunchAgent is only supported on macOS.")

    binary = app_binary or _find_app_binary()
    if binary is None:
        checked = [str(a) for a in _APP_PATHS]
        raise FileNotFoundError(
            "ClosedRoom.app not found in standard locations:\n"
            + "\n".join(f"  {p}" for p in checked)
            + "\nMove the app to /Applications/ first."
        )

    _LAUNCH_AGENTS_DIR.mkdir(parents=True, exist_ok=True)
    _ensure_log_dir()

    plist_content = _generate_plist(binary)
    _PLIST_PATH.write_text(plist_content, encoding="utf-8")

    # Load the agent immediately so the user doesn't need to log out
    try:
        subprocess.run(
            ["launchctl", "load", str(_PLIST_PATH)],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError:
        # Non-fatal: the plist is installed and will activate on next login
        pass

    return _PLIST_PATH


def uninstall_launch_agent() -> None:
    """
    Remove the LaunchAgent plist and unload it from launchd.

    No-op if the plist does not exist.
    """
    if not _PLIST_PATH.exists():
        return

    # Unload the agent first so it stops immediately
    try:
        subprocess.run(
            ["launchctl", "unload", str(_PLIST_PATH)],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError:
        pass  # Already unloaded or never loaded — safe to continue

    _PLIST_PATH.unlink(missing_ok=True)
