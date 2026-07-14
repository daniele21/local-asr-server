#!/usr/bin/env python3
"""Update the local-llm-server wheel dependency to the latest GitHub semver tag."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PYPROJECT_PATH = PROJECT_ROOT / "pyproject.toml"
LOCK_PATH = PROJECT_ROOT / "uv.lock"
DEFAULT_REPOSITORY_URL = "https://github.com/daniele21/local-llm-server.git"
TAG_PATTERN = re.compile(r"refs/tags/v?(\d+)\.(\d+)\.(\d+)$")
DEPENDENCY_PATTERN = re.compile(
    r'(?P<prefix>"local-llm-server(?:\[[A-Za-z0-9_,.-]+\])?\s*@\s*file://)'
    r'(?P<path>[^"\n]+)(?P<suffix>")'
)


@dataclass(frozen=True, order=True)
class Version:
    major: int
    minor: int
    patch: int

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"

    @property
    def tag(self) -> str:
        return f"v{self}"


def latest_version_from_ls_remote(output: str) -> Version:
    versions = []
    for line in output.splitlines():
        match = TAG_PATTERN.search(line.strip())
        if match:
            versions.append(Version(*(int(value) for value in match.groups())))
    if not versions:
        raise RuntimeError("Nessun tag semver stabile trovato nel repository local-llm-server")
    return max(versions)


def dependency_version(pyproject: str) -> Version | None:
    match = DEPENDENCY_PATTERN.search(pyproject)
    if not match:
        raise RuntimeError("Dipendenza file:// di local-llm-server non trovata in pyproject.toml")
    wheel = Path(match.group("path")).name
    version_match = re.fullmatch(r"local_llm_server-(\d+)\.(\d+)\.(\d+)-py3-none-any\.whl", wheel)
    if not version_match:
        return None
    return Version(*(int(value) for value in version_match.groups()))


def replace_dependency(pyproject: str, wheel_path: Path) -> str:
    replacement = rf'\g<prefix>{wheel_path.resolve()}\g<suffix>'
    updated, count = DEPENDENCY_PATTERN.subn(replacement, pyproject, count=1)
    if count != 1:
        raise RuntimeError("Impossibile aggiornare la dipendenza local-llm-server")
    return updated


def run(command: list[str], *, cwd: Path | None = None, capture: bool = False) -> str:
    result = subprocess.run(
        command,
        cwd=cwd,
        check=False,
        text=True,
        capture_output=capture,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip() if capture else ""
        raise RuntimeError(f"Comando fallito ({result.returncode}): {' '.join(command)}\n{detail}")
    return result.stdout if capture else ""


def atomic_write(path: Path, contents: bytes) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(contents)
    os.replace(temporary, path)


def resolve_repository_url(local_repo: Path) -> str:
    override = os.environ.get("LOCAL_LLM_SERVER_GITHUB_URL")
    if override:
        return override
    if (local_repo / ".git").exists():
        try:
            remote = run(["git", "remote", "get-url", "origin"], cwd=local_repo, capture=True).strip()
            if remote:
                return remote
        except RuntimeError:
            pass
    return DEFAULT_REPOSITORY_URL


def github_repository_slug(repository_url: str) -> str:
    match = re.search(r"github\.com[/:]([^/]+)/([^/]+?)(?:\.git)?$", repository_url)
    if not match:
        raise RuntimeError(f"Remote GitHub non riconosciuto: {repository_url}")
    return f"{match.group(1)}/{match.group(2)}"


def ensure_wheel(version: Version, repository_url: str, dist_dir: Path) -> Path:
    wheel = dist_dir / f"local_llm_server-{version}-py3-none-any.whl"
    if wheel.exists():
        return wheel
    gh = shutil.which("gh")
    if gh is None:
        raise RuntimeError("GitHub CLI (gh) non trovato: necessario per scaricare il wheel della release")
    with tempfile.TemporaryDirectory(prefix="closedroom-local-llm-wheel-") as temporary:
        download_dir = Path(temporary)
        run([
            gh,
            "release",
            "download",
            version.tag,
            "--repo",
            github_repository_slug(repository_url),
            "--pattern",
            wheel.name,
            "--dir",
            str(download_dir),
        ])
        downloaded = download_dir / wheel.name
        if not downloaded.exists():
            raise RuntimeError(
                f"La release {version.tag} non pubblica il wheel atteso {wheel.name}"
            )
        dist_dir.mkdir(parents=True, exist_ok=True)
        temporary_target = wheel.with_suffix(".whl.tmp")
        shutil.copy2(downloaded, temporary_target)
        os.replace(temporary_target, wheel)
    return wheel


def update_lock(pyproject_original: bytes, lock_original: bytes | None) -> None:
    try:
        run([shutil.which("uv") or "uv", "lock"], cwd=PROJECT_ROOT)
    except Exception:
        atomic_write(PYPROJECT_PATH, pyproject_original)
        if lock_original is None:
            LOCK_PATH.unlink(missing_ok=True)
        else:
            atomic_write(LOCK_PATH, lock_original)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Mostra l'ultima versione senza modificare file")
    parser.add_argument(
        "--local-repo",
        type=Path,
        default=PROJECT_ROOT.parent / "local-llm-server",
        help="Worktree locale usato per il remote origin e come destinazione dist/ dei wheel",
    )
    args = parser.parse_args()

    local_repo = args.local_repo.expanduser().resolve()
    repository_url = resolve_repository_url(local_repo)
    tags = run(["git", "ls-remote", "--tags", "--refs", repository_url], capture=True)
    latest = latest_version_from_ls_remote(tags)
    pyproject_original = PYPROJECT_PATH.read_bytes()
    current = dependency_version(pyproject_original.decode("utf-8"))
    print(f"local-llm-server: corrente={current or 'sconosciuta'} ultima={latest}")
    if args.check:
        return 0 if current == latest else 1

    wheel = ensure_wheel(latest, repository_url, local_repo / "dist")
    updated = replace_dependency(pyproject_original.decode("utf-8"), wheel)
    if updated == pyproject_original.decode("utf-8") and current == latest:
        print("Nessun aggiornamento necessario")
        return 0

    lock_original = LOCK_PATH.read_bytes() if LOCK_PATH.exists() else None
    atomic_write(PYPROJECT_PATH, updated.encode("utf-8"))
    update_lock(pyproject_original, lock_original)
    print(f"Aggiornato local-llm-server a {latest}: {wheel}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError) as error:
        print(f"errore: {error}", file=sys.stderr)
        raise SystemExit(2)
