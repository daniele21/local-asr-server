"""
audio_router.py — Automatic audio routing for Local ASR Server.

Creates a temporary stacked aggregate (Multi-Output) device that
combines the current physical output with BlackHole 2ch, enabling
simultaneous playback to headphones and system-audio capture.

Lifecycle:
    activate()  → detect output → create aggregate → switch output
    restore()   → switch back to original output → destroy aggregate

State is persisted to disk so the server can recover from crashes.
"""

from __future__ import annotations

import json
import logging
import sys
import threading
import uuid
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("uvicorn.error")

# ── Constants ──────────────────────────────────────────────────────────────────

TEMPORARY_DEVICE_NAME = "Local ASR Temporary Output"
UID_PREFIX = "com.local-asr.temporary-output."
BLACKHOLE_NAME_SUBSTRING = "blackhole"
STATE_FILENAME = "audio-routing-state.json"

# ── State persistence directory ────────────────────────────────────────────────

_PROJECT_CACHE = Path(__file__).parents[2] / ".cache"


def _state_file() -> Path:
    """Path to the routing state file on disk."""
    return _PROJECT_CACHE / STATE_FILENAME


# ── Routing state ──────────────────────────────────────────────────────────────

class _RoutingState:
    """
    Holds the current routing state.

    Persisted to disk as JSON so the server can clean up after a crash.
    """

    def __init__(self) -> None:
        self.session_id: Optional[str] = None
        self.original_output_uid: Optional[str] = None
        self.original_output_name: Optional[str] = None
        self.temporary_device_uid: Optional[str] = None
        self.status: str = "idle"  # idle | active

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "original_output_uid": self.original_output_uid,
            "original_output_name": self.original_output_name,
            "temporary_device_uid": self.temporary_device_uid,
            "status": self.status,
        }

    def save(self) -> None:
        """Persist state to disk."""
        try:
            _PROJECT_CACHE.mkdir(parents=True, exist_ok=True)
            _state_file().write_text(
                json.dumps(self.to_dict(), indent=2),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("Failed to persist routing state: %s", exc)

    def clear(self) -> None:
        """Clear state in memory and on disk."""
        self.session_id = None
        self.original_output_uid = None
        self.original_output_name = None
        self.temporary_device_uid = None
        self.status = "idle"
        try:
            state_path = _state_file()
            if state_path.exists():
                state_path.unlink()
        except OSError as exc:
            logger.warning("Failed to remove routing state file: %s", exc)

    @classmethod
    def load(cls) -> "_RoutingState":
        """Load state from disk, or return a fresh instance."""
        state = cls()
        state_path = _state_file()
        if not state_path.exists():
            return state
        try:
            data = json.loads(state_path.read_text(encoding="utf-8"))
            state.session_id = data.get("session_id")
            state.original_output_uid = data.get("original_output_uid")
            state.original_output_name = data.get("original_output_name")
            state.temporary_device_uid = data.get("temporary_device_uid")
            state.status = data.get("status", "idle")
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load routing state: %s", exc)
        return state


# ── AudioRouter ────────────────────────────────────────────────────────────────

class AudioRouter:
    """
    Manages automatic creation and teardown of a temporary stacked
    aggregate (Multi-Output) device for recording system audio.

    Thread-safe: uses a global lock to prevent concurrent routing
    operations from multiple browser tabs.
    """

    _lock = threading.Lock()
    _state = _RoutingState()
    _helper = None  # lazy-loaded AudioHelper

    # ── Helper access ──────────────────────────────────────────────────

    @classmethod
    def _get_helper(cls):
        """Lazy-load the AudioHelper (compiles on first use)."""
        if cls._helper is None:
            try:
                from local_asr_server.macos_audio_helper import AudioHelper
                cls._helper = AudioHelper()
            except Exception as exc:
                logger.warning("AudioHelper not available: %s", exc)
                return None
        return cls._helper

    # ── SwitchAudioSource fallback (for input switching) ───────────────

    @classmethod
    def _get_switch_audio_cmd(cls) -> Optional[str]:
        """Locate SwitchAudioSource (used only for input listing)."""
        import shutil
        if shutil.which("SwitchAudioSource"):
            return "SwitchAudioSource"
        for path in ("/opt/homebrew/bin/SwitchAudioSource",
                     "/usr/local/bin/SwitchAudioSource"):
            if Path(path).exists():
                return path
        return None

    # ── Device detection ───────────────────────────────────────────────

    @classmethod
    def _find_blackhole(cls, devices: list[dict]) -> Optional[dict]:
        """Find BlackHole 2ch among the devices."""
        for device in devices:
            name = device.get("name", "").casefold()
            if BLACKHOLE_NAME_SUBSTRING in name and device.get("is_output"):
                return device
        return None

    @classmethod
    def _is_virtual_output(cls, device_name: str) -> bool:
        """Check if a device name corresponds to a virtual device."""
        normalized = device_name.casefold()
        virtual_terms = (
            "blackhole",
            "multi-output",
            "uscite multiple",
            "multiple output",
            TEMPORARY_DEVICE_NAME.casefold(),
            "dispositivo con uscite multiple",
            "dispositivo combinato",
        )
        return any(term in normalized for term in virtual_terms)

    @classmethod
    def _find_physical_output(
        cls, current: dict, devices: list[dict]
    ) -> Optional[dict]:
        """
        Determine the physical output device.

        If the current output is already a physical device, return it.
        Otherwise, find the first physical output device.
        """
        if not cls._is_virtual_output(current.get("name", "")):
            return current
        # Current output is virtual; find the first physical output
        for device in devices:
            if (device.get("is_output")
                    and not cls._is_virtual_output(device.get("name", ""))):
                return device
        return None

    # ── Status ─────────────────────────────────────────────────────────

    @classmethod
    def get_status(cls) -> dict[str, Any]:
        """
        Return the current audio routing status.

        This replaces the old status check that looked for manually-created
        profiles.  The new check verifies that BlackHole and the Swift
        helper are available.
        """
        is_macos = sys.platform == "darwin"
        helper = cls._get_helper()
        helper_available = helper is not None

        devices: list[dict] = []
        current_output: Optional[dict] = None
        blackhole: Optional[dict] = None
        physical_output: Optional[dict] = None
        blackhole_installed = False

        if helper_available:
            try:
                devices = helper.list_devices()
                current_output = helper.get_current_output()
            except Exception as exc:
                logger.warning("Failed to query devices: %s", exc)

        if devices:
            blackhole = cls._find_blackhole(devices)
            blackhole_installed = blackhole is not None
            if current_output:
                physical_output = cls._find_physical_output(
                    current_output, devices
                )

        # Build missing/warnings lists
        missing: list[str] = []
        warnings: list[str] = []

        if not is_macos:
            warnings.append("Automatic audio routing is available only on macOS.")
        if is_macos and not helper_available:
            missing.append("audio_helper")
        if is_macos and helper_available and not blackhole_installed:
            missing.append("blackhole")

        ready = is_macos and not missing

        return {
            "ok": ready,
            "platform": sys.platform,
            "blackhole_installed": blackhole_installed,
            "audio_helper_available": helper_available,
            # Legacy compatibility fields
            "switchaudio_installed": cls._get_switch_audio_cmd() is not None,
            "input_device": None,
            "output_device": (
                cls._state.temporary_device_uid
                if cls._state.status == "active"
                else (current_output or {}).get("name")
            ),
            "current_input": None,
            "current_output": (current_output or {}).get("name"),
            "physical_output": (physical_output or {}).get("name"),
            "expected_profile": None,  # No longer needed
            "profile_exists": True,    # Always true with auto-creation
            "ready_to_record": ready,
            "routing_active": cls._state.status == "active",
            "missing": missing,
            "warnings": warnings,
            "auto_routing": True,  # Flag for frontend to know we support auto
        }

    # ── Activate / Restore ─────────────────────────────────────────────

    @classmethod
    def route_to_multi_output(cls) -> bool:
        """
        Create a temporary stacked aggregate device and set it as output.

        Steps:
        1. Get current (physical) output device.
        2. Find BlackHole 2ch.
        3. Create stacked aggregate with drift correction on BlackHole.
        4. Set aggregate as default + system output.
        5. Persist state to disk.

        Returns True on success.
        """
        if sys.platform != "darwin":
            return False

        helper = cls._get_helper()
        if not helper:
            logger.warning("AudioHelper not available; cannot route audio.")
            return False

        with cls._lock:
            # If already active, return success
            if cls._state.status == "active":
                logger.info("Audio routing already active.")
                return True

            try:
                # Step 1: Get current output
                current = helper.get_current_output()
                logger.info(
                    "Current output: '%s' (UID: %s)",
                    current.get("name"), current.get("uid"),
                )

                # Step 2: Resolve physical output
                devices = helper.list_devices()
                physical = cls._find_physical_output(current, devices)
                if not physical:
                    logger.error("No physical output device found.")
                    return False

                # Step 3: Find BlackHole
                blackhole = cls._find_blackhole(devices)
                if not blackhole:
                    logger.error("BlackHole 2ch not found.")
                    return False

                # Step 4: Generate session ID and create aggregate
                session_id = uuid.uuid4().hex[:12]
                aggregate_uid = f"{UID_PREFIX}{session_id}"

                logger.info(
                    "Creating stacked aggregate: '%s' = '%s' + '%s'",
                    TEMPORARY_DEVICE_NAME,
                    physical["name"],
                    blackhole["name"],
                )

                result = helper.create_aggregate(
                    name=TEMPORARY_DEVICE_NAME,
                    uid=aggregate_uid,
                    main_uid=physical["uid"],
                    secondary_uid=blackhole["uid"],
                )
                logger.info(
                    "Aggregate created: device_id=%s, uid=%s",
                    result.get("device_id"), result.get("uid"),
                )

                # Step 5: Set as default output
                helper.set_default_output(aggregate_uid)
                logger.info(
                    "Set '%s' as default output.", TEMPORARY_DEVICE_NAME
                )

                # Step 6: Persist state
                cls._state.session_id = session_id
                cls._state.original_output_uid = physical["uid"]
                cls._state.original_output_name = physical["name"]
                cls._state.temporary_device_uid = aggregate_uid
                cls._state.status = "active"
                cls._state.save()

                return True

            except Exception as exc:
                logger.error("Failed to activate audio routing: %s", exc)
                # Attempt cleanup on failure
                cls._cleanup_on_failure()
                return False

    @classmethod
    def restore_original_output(cls) -> bool:
        """
        Restore the original output device and destroy the temporary
        aggregate.

        Returns True on success.
        """
        if sys.platform != "darwin":
            return False

        helper = cls._get_helper()
        if not helper:
            return False

        with cls._lock:
            if cls._state.status != "active":
                return True  # Nothing to restore

            success = True

            # Restore original output
            if cls._state.original_output_uid:
                try:
                    helper.set_default_output(cls._state.original_output_uid)
                    logger.info(
                        "Restored output to '%s'.",
                        cls._state.original_output_name,
                    )
                except Exception as exc:
                    logger.error("Failed to restore output: %s", exc)
                    success = False

            # Destroy temporary aggregate
            if cls._state.temporary_device_uid:
                try:
                    helper.destroy_aggregate(cls._state.temporary_device_uid)
                    logger.info(
                        "Destroyed temporary aggregate: %s",
                        cls._state.temporary_device_uid,
                    )
                except Exception as exc:
                    logger.error("Failed to destroy aggregate: %s", exc)
                    success = False

            cls._state.clear()
            return success

    @classmethod
    def _cleanup_on_failure(cls) -> None:
        """Best-effort cleanup when routing activation fails midway."""
        helper = cls._get_helper()
        if not helper:
            return

        # Try to restore original output if we saved it
        if cls._state.original_output_uid:
            try:
                helper.set_default_output(cls._state.original_output_uid)
            except Exception:
                pass

        # Try to destroy temporary device if we created it
        if cls._state.temporary_device_uid:
            try:
                helper.destroy_aggregate(cls._state.temporary_device_uid)
            except Exception:
                pass

        cls._state.clear()

    # ── Orphan cleanup ─────────────────────────────────────────────────

    @classmethod
    def cleanup_orphans(cls) -> int:
        """
        Find and destroy any leftover temporary aggregate devices.

        Called at server startup.  Identifies orphans by their UID prefix
        (``com.local-asr.temporary-output.``).

        Also restores the original output if state was persisted.

        Returns the number of orphan devices destroyed.
        """
        if sys.platform != "darwin":
            return 0

        helper = cls._get_helper()
        if not helper:
            return 0

        destroyed = 0

        with cls._lock:
            # First, check for persisted state and try to restore
            persisted = _RoutingState.load()
            if persisted.status == "active" and persisted.original_output_uid:
                try:
                    helper.set_default_output(persisted.original_output_uid)
                    logger.info(
                        "Restored output from crash recovery: '%s'",
                        persisted.original_output_name,
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed to restore output during cleanup: %s", exc
                    )

            # Find and destroy orphan devices by UID prefix
            try:
                devices = helper.list_devices()
                for device in devices:
                    uid = device.get("uid", "")
                    if uid.startswith(UID_PREFIX):
                        try:
                            helper.destroy_aggregate(uid)
                            logger.info(
                                "Destroyed orphan aggregate: '%s' (%s)",
                                device.get("name"), uid,
                            )
                            destroyed += 1
                        except Exception as exc:
                            logger.warning(
                                "Failed to destroy orphan '%s': %s", uid, exc
                            )
            except Exception as exc:
                logger.warning("Failed to list devices for cleanup: %s", exc)

            # Clear persisted state
            cls._state.clear()

        if destroyed > 0:
            logger.info("Cleaned up %d orphan aggregate device(s).", destroyed)
        return destroyed
