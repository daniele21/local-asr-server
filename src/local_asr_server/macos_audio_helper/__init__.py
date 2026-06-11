"""
macos_audio_helper — Python wrapper for the Core Audio Swift helper.

Provides the `AudioHelper` class that compiles (and caches) a small Swift
binary to manage macOS Aggregate/Multi-Output devices programmatically.

Usage::

    from local_asr_server.macos_audio_helper import AudioHelper

    helper = AudioHelper()
    devices = helper.list_devices()
    helper.create_aggregate(
        name="Local ASR Temporary Output",
        uid="com.local-asr.temporary-output.abc123",
        main_uid="AppleUSBAudioEngine:...",
        secondary_uid="BlackHole2ch_UID",
    )
"""

from __future__ import annotations

import json
import logging
import subprocess
from typing import Any, Optional

from local_asr_server.macos_audio_helper.compile import get_helper_binary

logger = logging.getLogger("uvicorn.error")


class AudioHelperError(Exception):
    """Raised when the Swift helper returns an error."""


class AudioHelper:
    """
    High-level Python interface to the Core Audio Swift helper binary.

    The binary is compiled automatically on first use and cached for
    subsequent invocations.  All methods return parsed JSON objects.
    """

    def __init__(self) -> None:
        self._binary: Optional[str] = None

    # ── Private helpers ────────────────────────────────────────────────

    def _ensure_binary(self) -> str:
        """Compile or locate the cached helper binary."""
        if self._binary is None:
            self._binary = get_helper_binary()
        return self._binary

    def _run(self, *args: str) -> dict[str, Any]:
        """
        Execute the helper binary with the given arguments.

        Returns the parsed JSON output.  Raises `AudioHelperError` on
        non-zero exit codes or unparseable output.
        """
        binary = self._ensure_binary()
        cmd = [binary, *args]
        logger.debug("AudioHelper running: %s", " ".join(cmd))

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except FileNotFoundError:
            raise AudioHelperError(
                f"Helper binary not found at '{binary}'. "
                "Re-run compilation with AudioHelper()."
            )
        except subprocess.TimeoutExpired:
            raise AudioHelperError(
                "Helper binary timed out after 10 seconds."
            )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            raise AudioHelperError(
                f"Helper exited with code {result.returncode}: {stderr}"
            )

        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise AudioHelperError(
                f"Failed to parse helper output: {exc}\n"
                f"stdout: {result.stdout[:500]}"
            )

    # ── Public API ─────────────────────────────────────────────────────

    def list_devices(self) -> list[dict[str, Any]]:
        """
        List all audio devices known to Core Audio.

        Returns a list of dicts with keys:
        ``id``, ``uid``, ``name``, ``is_input``, ``is_output``.
        """
        response = self._run("list-devices")
        return response.get("devices", [])

    def get_current_output(self) -> dict[str, Any]:
        """
        Return the current default output device.

        Returns a dict with ``id``, ``uid``, ``name``.
        """
        return self._run("current-output")

    def create_aggregate(
        self,
        *,
        name: str,
        uid: str,
        main_uid: str,
        secondary_uid: str,
    ) -> dict[str, Any]:
        """
        Create a stacked aggregate (Multi-Output) device.

        Args:
            name: Human-visible name (e.g. "Local ASR Temporary Output").
            uid: Unique identifier (e.g. "com.local-asr.temporary-output.xyz").
            main_uid: UID of the primary (clock source) device.
            secondary_uid: UID of the secondary device (drift-corrected).

        Returns a dict with ``device_id`` of the newly created device.
        """
        return self._run(
            "create-aggregate",
            "--name", name,
            "--uid", uid,
            "--main", main_uid,
            "--secondary", secondary_uid,
        )

    def set_default_output(self, device_uid: str) -> dict[str, Any]:
        """
        Set a device as both the default and system output.

        Args:
            device_uid: The UID of the target output device.
        """
        return self._run("set-output", device_uid)

    def destroy_aggregate(self, device_uid: str) -> dict[str, Any]:
        """
        Destroy an aggregate device by its UID.

        Args:
            device_uid: The UID of the aggregate device to destroy.
        """
        return self._run("destroy", device_uid)

    def find_device_by_substring(
        self, substring: str, *, output_only: bool = False
    ) -> Optional[dict[str, Any]]:
        """
        Find the first device whose name contains *substring* (case-insensitive).

        Args:
            substring: Partial name to search for.
            output_only: If True, only search output-capable devices.

        Returns the device dict, or None if not found.
        """
        devices = self.list_devices()
        needle = substring.casefold()
        for device in devices:
            if needle in device.get("name", "").casefold():
                if output_only and not device.get("is_output", False):
                    continue
                return device
        return None
