"""
menubar.py — ClosedRoom macOS Menu Bar App.

This module is the main entry point for the ClosedRoom.app bundle.
It runs the FastAPI server in a background thread and exposes a rumps
status-bar icon with quick actions.

Usage (dev):
    python -m local_asr_server.menubar
    local-asr app   ← via cli.py

Usage (bundle):
    Launched automatically by PyInstaller when the .app opens.
"""

from __future__ import annotations

import logging
import threading
import webbrowser
from pathlib import Path
from typing import Optional

from local_asr_server.window import ClosedRoomWindowManager

logger = logging.getLogger(__name__)

# ── Lazy import of rumps so the module can still be imported on systems
#    where rumps is not installed (e.g. in CI or Linux dev environments).
try:
    import rumps
    _RUMPS_AVAILABLE = True
except ImportError:
    _RUMPS_AVAILABLE = False

# ── Constants ─────────────────────────────────────────────────────────────────

APP_PORT = 1236
APP_URL = f"http://127.0.0.1:{APP_PORT}"

# Status icons shown in the menu bar (using SF Symbols via text fallbacks)
ICON_IDLE = "🎙️"
ICON_RECORDING = "🔴"
ICON_TRANSCRIBING = "⏳"
ICON_ERROR = "⚠️"


# ── Server thread ─────────────────────────────────────────────────────────────

class _ServerThread(threading.Thread):
    """
    Runs the FastAPI/uvicorn server in a daemon thread so it exits when
    the main menu bar process exits.
    """

    def __init__(self) -> None:
        super().__init__(name="closedroom-server", daemon=True)
        self._server: Optional[object] = None
        self.ready = threading.Event()

    def run(self) -> None:
        import uvicorn
        from local_asr_server.server import create_app
        from local_asr_server.settings import load_settings
        from local_asr_server.paths import APP_NAME

        # If a server is already running on APP_PORT, reuse it
        if _check_server_health():
            logger.info("A server is already running on port %s. Reusing it.", APP_PORT)
            self.ready.set()
            return

        settings = load_settings()
        recordings_dir = Path(settings.get("recordings_dir", f"~/Recordings/{APP_NAME}")).expanduser()


        app = create_app(
            recordings_dir=recordings_dir,
        )

        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=APP_PORT,
            log_level="warning",
            loop="asyncio",
        )
        self._server = uvicorn.Server(config)

        # Signal that startup is complete so the menu bar can update its icon
        original_startup = self._server.startup

        async def _startup_with_signal(sockets=None):
            await original_startup(sockets=sockets)
            self.ready.set()

        self._server.startup = _startup_with_signal
        self._server.run()

    def stop(self) -> None:
        """Request graceful server shutdown."""
        if self._server:
            self._server.should_exit = True


# ── Health check ──────────────────────────────────────────────────────────────

def _check_server_health() -> bool:
    """Return True if the local server is responding."""
    import urllib.request
    import urllib.error
    try:
        with urllib.request.urlopen(f"{APP_URL}/health", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def _get_server_status() -> dict:
    """Return the parsed /health JSON or an empty dict on failure."""
    import urllib.request
    import json
    try:
        with urllib.request.urlopen(f"{APP_URL}/health", timeout=2) as resp:
            return json.loads(resp.read())
    except Exception:
        return {}


# ── LaunchAgent helpers (forward to launchd module) ───────────────────────────

def _toggle_launch_agent(menu_item) -> None:
    """Install or uninstall the LaunchAgent depending on current state."""
    try:
        from local_asr_server.launchd import (
            is_launch_agent_installed,
            install_launch_agent,
            uninstall_launch_agent,
        )
        if is_launch_agent_installed():
            uninstall_launch_agent()
            menu_item.title = "Avvia al login"
            rumps.notification("ClosedRoom", "", "Auto-start disabilitato.")
        else:
            install_launch_agent()
            menu_item.title = "✓ Avvia al login"
            rumps.notification("ClosedRoom", "", "ClosedRoom si avvierà al login.")
    except Exception as exc:
        logger.error("Failed to toggle launch agent: %s", exc)
        rumps.alert("Errore", f"Impossibile modificare l'auto-start:\n{exc}")


# ── Main App ──────────────────────────────────────────────────────────────────

class ClosedRoomApp(rumps.App):
    """
    macOS application for ClosedRoom.

    Provides a status-bar icon with quick actions and launches a native NSWindow
    hosting a WKWebView. The FastAPI server is run in a background thread.
    """

    def __init__(self) -> None:
        # Use a plain text title while we load; we'll update after server starts
        super().__init__(
            name="ClosedRoom",
            title=ICON_IDLE,
            quit_button=None,  # we provide our own Esci item
        )

        # Build the menu
        self._build_menu()

        # Initialize the window manager
        self.window_manager = ClosedRoomWindowManager(APP_URL)

        # Start the server
        self._server_thread = _ServerThread()
        self._server_thread.start()

        # Poll until server is ready, then update icon
        threading.Thread(target=self._wait_for_server, daemon=True).start()

        # Delay the window show slightly to run after Cocoa event loop is active
        self._show_timer = rumps.Timer(self._initial_show, 0.1)
        self._show_timer.start()

        # Periodic status refresh (every 5 s)
        self._status_timer = rumps.Timer(self._refresh_status, 5)
        self._status_timer.start()

    def _initial_show(self, timer: rumps.Timer) -> None:
        """One-shot timer to show the window once the Cocoa run loop is active."""
        timer.stop()
        self.window_manager.show()

    # ── Menu construction ──────────────────────────────────────────────────

    def _build_menu(self) -> None:
        """Construct the drop-down menu items."""
        from local_asr_server.launchd import is_launch_agent_installed

        launch_agent_title = (
            "✓ Avvia al login"
            if is_launch_agent_installed()
            else "Avvia al login"
        )

        self.menu = [
            rumps.MenuItem("Apri ClosedRoom", callback=self._open_window),
            rumps.separator,
            rumps.MenuItem("Stato: in avvio…"),
            rumps.separator,
            rumps.MenuItem("⏺ Avvia registrazione", callback=self._start_recording),
            rumps.MenuItem("⏹ Ferma registrazione", callback=self._stop_recording),
            rumps.separator,
            rumps.MenuItem("Preferenze…", callback=self._open_preferences),
            rumps.MenuItem(launch_agent_title, callback=_toggle_launch_agent),
            rumps.separator,
            rumps.MenuItem("Esci", callback=self._quit),
        ]

        # Disable recording controls until server is ready
        self.menu["⏺ Avvia registrazione"].set_callback(None)
        self.menu["⏹ Ferma registrazione"].set_callback(None)

    # ── Server lifecycle ───────────────────────────────────────────────────

    def _wait_for_server(self) -> None:
        """Block until the server reports healthy, then update the UI and load WebView."""
        self._server_thread.ready.wait(timeout=60)
        # Extra wait for uvicorn to bind the port
        import time
        for _ in range(20):
            if _check_server_health():
                break
            time.sleep(0.5)

        from local_asr_server.window import run_on_main_thread

        def update_ui():
            # Update status item and re-enable recording controls
            self._update_status_item("Server attivo ✅")
            self.menu["⏺ Avvia registrazione"].set_callback(self._start_recording)
            self.menu["⏹ Ferma registrazione"].set_callback(self._stop_recording)

            # Replace loading screen with the real application URL
            self.window_manager.load_url(APP_URL)

        run_on_main_thread(update_ui)


    # ── Periodic status refresh ────────────────────────────────────────────

    @rumps.timer(5)
    def _refresh_status(self, _) -> None:
        """Update the status menu item and icon every 5 seconds."""
        status = _get_server_status()
        if not status:
            self._update_status_item("Server non raggiungibile ⚠️")
            self.title = ICON_ERROR
            return

        self.title = ICON_IDLE
        self._update_status_item("Server attivo ✅")

    def _update_status_item(self, text: str) -> None:
        self.menu["Stato: in avvio…"].title = f"Stato: {text}"

    # ── Menu callbacks ─────────────────────────────────────────────────────

    def _open_window(self, _) -> None:
        """Show and focus the native application window."""
        self.window_manager.show()

    def _start_recording(self, _) -> None:
        """Show window and navigate to the recorder section."""
        self.window_manager.show()
        self.window_manager.load_url(f"{APP_URL}/#record")

    def _stop_recording(self, _) -> None:
        """Show window and navigate to the recorder section."""
        self.window_manager.show()
        self.window_manager.load_url(f"{APP_URL}/#record")

    def _open_preferences(self, _) -> None:
        """Show window and navigate to the settings tab."""
        self.window_manager.show()
        self.window_manager.load_url(f"{APP_URL}/#settings")

    def _quit(self, _) -> None:
        """Gracefully stop the server, close the window, and quit."""
        self._status_timer.stop()
        self.window_manager.close()
        self._server_thread.stop()
        rumps.quit_application()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    """Run the ClosedRoom menu bar application."""
    if not _RUMPS_AVAILABLE:
        raise SystemExit(
            "rumps is not installed. Install it with:\n"
            "  pip install rumps\n"
            "or:\n"
            "  uv pip install rumps"
        )

    logging.basicConfig(level=logging.WARNING)
    ClosedRoomApp().run()


if __name__ == "__main__":
    main()
