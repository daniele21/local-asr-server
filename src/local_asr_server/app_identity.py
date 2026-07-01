"""Runtime identity helpers for the ClosedRoom app and bundled server."""

from __future__ import annotations

import os
import plistlib
from dataclasses import dataclass
from importlib import metadata

from local_asr_server import __version__
from local_asr_server.paths import (
    APP_BUNDLE_ID,
    APP_NAME,
    get_app_contents_dir,
    is_bundled,
)


@dataclass(frozen=True)
class AppIdentity:
    name: str
    version: str
    bundle_identifier: str
    display_name: str
    bundled: bool
    pid: int

    def as_health_payload(self) -> dict:
        return {
            "app_name": self.name,
            "app_version": self.version,
            "bundle_identifier": self.bundle_identifier,
            "bundle_display_name": self.display_name,
            "bundled": self.bundled,
            "pid": self.pid,
        }


def get_bundle_display_name() -> str:
    """Return the visible bundle name from Info.plist when bundled."""
    contents_dir = get_app_contents_dir()
    if contents_dir is None:
        return APP_NAME

    info_plist = contents_dir / "Info.plist"
    try:
        with info_plist.open("rb") as f:
            payload = plistlib.load(f)
    except Exception:
        return APP_NAME

    value = payload.get("CFBundleDisplayName") or payload.get("CFBundleName")
    return str(value or APP_NAME)


def get_bundle_identifier() -> str:
    """Return the bundle identifier from Info.plist when bundled, falling back to paths.APP_BUNDLE_ID."""
    contents_dir = get_app_contents_dir()
    if contents_dir is None:
        return APP_BUNDLE_ID

    info_plist = contents_dir / "Info.plist"
    try:
        with info_plist.open("rb") as f:
            payload = plistlib.load(f)
    except Exception:
        return APP_BUNDLE_ID

    value = payload.get("CFBundleIdentifier")
    return str(value or APP_BUNDLE_ID)


def get_app_version() -> str:
    """Return the installed package version, falling back to the module version."""
    try:
        return metadata.version("local-asr-server")
    except metadata.PackageNotFoundError:
        return __version__


def get_app_identity() -> AppIdentity:
    """Return the current process identity used to detect stale app servers."""
    return AppIdentity(
        name=APP_NAME,
        version=get_app_version(),
        bundle_identifier=get_bundle_identifier(),
        display_name=get_bundle_display_name(),
        bundled=is_bundled(),
        pid=os.getpid(),
    )
