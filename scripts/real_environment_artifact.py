#!/usr/bin/env python3
"""Select and prepare one exact-revision ClosedRoom artifact for target-Mac evidence.

The target-Mac runner intentionally reuses an existing successful finalized app
for the current clean revision. This keeps an ad-hoc-signed bundle stable across
TCC permission reruns instead of rebuilding a new identity every time.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

GENERATED_FRONTEND = Path("src/local_asr_server/static")


def run_text(cmd: list[str], *, cwd: Path) -> str:
    result = subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True)
    return result.stdout.strip()


def git_state(root: Path) -> tuple[str, list[str]]:
    revision = run_text(["git", "rev-parse", "--short=12", "HEAD"], cwd=root)
    status = run_text(["git", "status", "--porcelain"], cwd=root)
    return revision, [line for line in status.splitlines() if line.strip()]


def manifest_source_revision(data: dict[str, Any]) -> str:
    source = data.get("source")
    if isinstance(source, dict):
        value = source.get("revision")
        if value:
            return str(value)
    return str(data.get("source_revision") or "")


def manifest_source_dirty(data: dict[str, Any]) -> bool:
    source = data.get("source")
    if isinstance(source, dict) and "dirty" in source:
        return bool(source.get("dirty"))
    return bool(data.get("dirty", False))


def revisions_match(left: str, right: str) -> bool:
    return bool(left and right and (left.startswith(right) or right.startswith(left)))


def exact_finalized_app(root: Path, revision: str) -> tuple[Path, Path] | None:
    matches: list[tuple[str, Path, Path]] = []
    for manifest_path in (root / "dist" / "artifacts").glob("*/*/build-manifest.json"):
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if data.get("status") != "successful" or manifest_source_dirty(data):
            continue
        if not revisions_match(revision, manifest_source_revision(data)):
            continue
        app_name = data.get("artifacts", {}).get("app", {}).get("path")
        if not app_name:
            continue
        app_path = manifest_path.parent / str(app_name)
        if app_path.is_dir():
            matches.append((str(data.get("created_at") or ""), app_path, manifest_path))
    if not matches:
        return None
    _, app_path, manifest_path = max(matches, key=lambda item: item[0])
    return app_path, manifest_path


def restore_generated_frontend(root: Path) -> None:
    """Restore only Vite's committed output after a build that began clean."""
    target = GENERATED_FRONTEND.as_posix()
    subprocess.run(
        ["git", "restore", "--source=HEAD", "--staged", "--worktree", "--", target],
        cwd=root,
        check=True,
    )
    subprocess.run(["git", "clean", "-fd", "--", target], cwd=root, check=True)


def prepare_exact_app(root: Path, revision: str) -> tuple[Path, Path, str]:
    """Reuse an exact finalized app, or build it once and restore generated source output."""
    existing = exact_finalized_app(root, revision)
    if existing is not None:
        app_path, manifest_path = existing
        return app_path, manifest_path, "reused_exact"

    current_revision, dirty_entries = git_state(root)
    if not revisions_match(revision, current_revision):
        raise RuntimeError(f"source_revision_moved:{revision}->{current_revision}")
    if dirty_entries:
        raise RuntimeError("checkout_dirty_before_build:" + " | ".join(dirty_entries))

    subprocess.run(["bash", "scripts/build_artifact.sh", "--no-dmg"], cwd=root, check=True)
    restore_generated_frontend(root)

    after_revision, after_dirty = git_state(root)
    if not revisions_match(revision, after_revision):
        raise RuntimeError(f"source_revision_moved_during_build:{revision}->{after_revision}")
    if after_dirty:
        raise RuntimeError("build_left_checkout_dirty:" + " | ".join(after_dirty))

    built = exact_finalized_app(root, revision)
    if built is None:
        raise RuntimeError(f"exact_finalized_artifact_missing_after_build:{revision}")
    app_path, manifest_path = built
    return app_path, manifest_path, "built_exact"
