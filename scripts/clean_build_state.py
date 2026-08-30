#!/usr/bin/env python3
"""Clean transient ClosedRoom build state without deleting finalized artifacts."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--purge-artifacts", action="store_true")
    return parser.parse_args()


def remove(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    elif path.exists() or path.is_symlink():
        path.unlink()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    for rel in (
        "build",
        "build_venv",
        ".cache/uv",
        ".cache/pyinstaller",
        "frontend/node_modules",
        "dist/wheels",
        "dist/last-build.json",
    ):
        remove(root / rel)

    dist = root / "dist"
    if dist.is_dir():
        for child in dist.iterdir():
            if child.name == "artifacts" and not args.purge_artifacts:
                continue
            if child.name == "artifacts" and args.purge_artifacts:
                remove(child)
                continue
            if child.suffix in {".app", ".dmg"} or child.name.startswith("ClosedRoom-"):
                remove(child)
    print("Transient build state cleaned" + ("; finalized artifacts purged" if args.purge_artifacts else "; finalized artifacts preserved"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
