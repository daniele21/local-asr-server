#!/usr/bin/env python3
"""Select ClosedRoom validation depth from the exact changed-path blast radius."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

RANK = {"lean": 0, "scoped": 1, "strong": 2, "full": 3}

FULL_EXACT = {
    ".engineering/baseline.json",
    ".engineering/commands.json",
    ".github/workflows/preflight.yml",
    ".github/workflows/repository-health.yml",
    "ClosedRoom.spec",
    "build.sh",
    "create_dmg.sh",
    "pyproject.toml",
    "setup.sh",
    "uv.lock",
    "scripts/finalize_build_artifact.py",
    "scripts/select_validation_profile.py",
}
FULL_PREFIXES = (
    ".github/workflows/",
    "build_assets/",
)
STRONG_EXACT = {
    ".engineering/e2e.json",
    "scripts/smoke_packaged_app.py",
    "src/local_asr_server/catalog.py",
    "src/local_asr_server/recordings.py",
    "src/local_asr_server/server.py",
    "src/local_asr_server/settings.py",
}
STRONG_PREFIXES = (
    "src/local_asr_server/jobs/",
    "src/local_asr_server/macos_audio_helper/",
    "src/local_asr_server/native_capture",
    "src/local_asr_server/runtime/",
    "src/local_asr_server/services/",
    "src/local_asr_server/speaker_",
    "src/local_asr_server/visual_intelligence/",
)
LEAN_EXACT = {
    ".editorconfig",
    ".gitignore",
    ".github/pull_request_template.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
}
LEAN_PREFIXES = (
    "design/",
    "docs/",
    "skills/",
)
SCOPED_PREFIXES = (
    "frontend/",
    "src/",
    "test/",
    "scripts/",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", help="Base revision for git diff")
    parser.add_argument("--head", default="HEAD", help="Head revision for git diff")
    parser.add_argument(
        "--changed-file",
        action="append",
        default=[],
        help="Explicit changed path; repeat for deterministic tests",
    )
    parser.add_argument("--format", choices=("text", "json", "github"), default="text")
    return parser.parse_args()


def _git_changed_files(base: str, head: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...{head}"],
        check=True,
        capture_output=True,
        text=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def classify_path(path: str) -> tuple[str, str]:
    normalized = Path(path).as_posix().lstrip("./")
    if normalized in FULL_EXACT or normalized.startswith(FULL_PREFIXES):
        return "full", "validation/build/dependency machinery changed"
    if normalized in STRONG_EXACT or normalized.startswith(STRONG_PREFIXES):
        return "strong", "runtime/native/persistence/E2E boundary changed"
    if normalized in LEAN_EXACT or normalized.startswith(LEAN_PREFIXES):
        return "lean", "documentation/governance-only path"
    if normalized.startswith(SCOPED_PREFIXES):
        return "scoped", "contained implementation/test/frontend path"
    return "full", "unclassified path fails safe to full"


def select_profile(paths: list[str]) -> dict[str, object]:
    unique_paths = sorted(set(paths))
    if not unique_paths:
        return {
            "profile": "lean",
            "reason": "no changed paths detected; cheapest structural validation",
            "changed_files": [],
            "classifications": [],
        }

    classifications: list[dict[str, str]] = []
    selected = "lean"
    strongest_reasons: list[str] = []
    for path in unique_paths:
        profile, reason = classify_path(path)
        classifications.append({"path": path, "profile": profile, "reason": reason})
        if RANK[profile] > RANK[selected]:
            selected = profile
            strongest_reasons = [f"{path}: {reason}"]
        elif RANK[profile] == RANK[selected]:
            strongest_reasons.append(f"{path}: {reason}")

    return {
        "profile": selected,
        "reason": "; ".join(strongest_reasons[:4]),
        "changed_files": unique_paths,
        "classifications": classifications,
    }


def main() -> int:
    args = parse_args()
    try:
        paths = args.changed_file or _git_changed_files(args.base, args.head) if args.base else args.changed_file
    except subprocess.CalledProcessError as exc:
        print(f"validation profile selection failed: {exc.stderr or exc}", file=sys.stderr)
        return 2

    result = select_profile(paths)
    if args.format == "json":
        print(json.dumps(result, indent=2, sort_keys=True))
    elif args.format == "github":
        reason = str(result["reason"]).replace("\n", " ")
        print(f"profile={result['profile']}")
        print(f"reason={reason}")
        print(f"changed_count={len(result['changed_files'])}")
    else:
        print(f"PROFILE={str(result['profile']).upper()}")
        print(f"REASON={result['reason']}")
        for item in result["classifications"]:
            print(f"- {item['profile'].upper():6} {item['path']} — {item['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
