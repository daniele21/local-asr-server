#!/usr/bin/env python3
"""
ClosedRoom.spec — PyInstaller spec file for the ClosedRoom macOS .app bundle.

Build with:
    pyinstaller ClosedRoom.spec

Or via the build script:
    ./build.sh
"""

import sys
import shutil
from pathlib import Path

# ── Project layout ─────────────────────────────────────────────────────────────

PROJECT_ROOT   = Path(SPECPATH)                                     # noqa: F821
# Try to extract the app version from pyproject.toml
APP_VERSION = "1.0.0"
try:
    import tomllib
    with open(PROJECT_ROOT / "pyproject.toml", "rb") as _f:
        APP_VERSION = tomllib.load(_f)["project"]["version"]
except Exception:
    try:
        import re
        _content = (PROJECT_ROOT / "pyproject.toml").read_text()
        _m = re.search(r'version\s*=\s*"([^"]+)"', _content)
        if _m:
            APP_VERSION = _m.group(1)
    except Exception:
        pass

CACHE_DIR      = PROJECT_ROOT / ".cache"
AUDIO_HELPER   = CACHE_DIR / "audio-helper" / "audio-helper"
NATIVE_CAPTURE_HELPER = CACHE_DIR / "native-capture-helper" / "native-capture-helper"
BUILD_ASSETS   = PROJECT_ROOT / "build_assets"                      # created by build.sh

# Resolve paths from the installed package in the active environment
try:
    import local_asr_server
    INSTALLED_PKG_DIR = Path(local_asr_server.__file__).parent
    STATIC_DIR        = INSTALLED_PKG_DIR / "static"
    print(f"[SPEC] Resolved local_asr_server to: {INSTALLED_PKG_DIR}")
except ImportError:
    INSTALLED_PKG_DIR = PROJECT_ROOT / "src" / "local_asr_server"
    STATIC_DIR        = INSTALLED_PKG_DIR / "static"
    print(f"[SPEC] Warning: local_asr_server not installed in env. Using source folder fallback: {INSTALLED_PKG_DIR}")


# ── Pre-flight checks ──────────────────────────────────────────────────────────

if not AUDIO_HELPER.exists():
    raise FileNotFoundError(
        f"Pre-compiled audio helper not found at {AUDIO_HELPER}.\n"
        "Run: ./build.sh  (or: uv run local-asr setup-audio)"
    )

if not NATIVE_CAPTURE_HELPER.exists():
    raise FileNotFoundError(
        f"Pre-compiled native capture helper not found at {NATIVE_CAPTURE_HELPER}.\n"
        "Run: ./build.sh"
    )

ffmpeg_bin = BUILD_ASSETS / "ffmpeg"
if not ffmpeg_bin.exists():
    raise FileNotFoundError(
        f"Static ffmpeg not found at {ffmpeg_bin}.\n"
        "Run: ./build.sh  to download and bundle it."
    )

# ── Collect binaries: audio-helper + ffmpeg ────────────────────────────────────

extra_binaries = [
    # PyInstaller may stage collected binaries under Contents/Frameworks in
    # macOS app bundles; build.sh discovers and signs the realized paths.
    (str(AUDIO_HELPER), "."),
    (str(ffmpeg_bin), "."),
]

# Collect ffmpeg dylibs from build_assets/lib/ if present (bundled by build.sh)
lib_dir = BUILD_ASSETS / "lib"
if lib_dir.exists():
    for dylib in lib_dir.glob("*.dylib"):
        extra_binaries.append((str(dylib), "."))

# ── Collect data: static web UI + mlx_whisper assets ──────────────────────────

extra_datas = [
    (str(STATIC_DIR), "static"),
]

# mlx_whisper ships tokenizer data (json / tiktoken files)
import mlx_whisper as _mlx_w
mlx_w_dir = Path(_mlx_w.__file__).parent
for ext in ("*.json", "*.tiktoken", "*.txt", "*.npz"):
    for f in mlx_w_dir.rglob(ext):
        rel = str(f.parent.relative_to(mlx_w_dir.parent))
        extra_datas.append((str(f), rel))

# ── Hidden imports ─────────────────────────────────────────────────────────────
# Modules loaded dynamically (not detected by PyInstaller's static analysis).

hidden_imports = [
    # SSL/Certificates
    "certifi",

    # FastAPI / Starlette internals
    "fastapi",
    "fastapi.middleware.cors",
    "starlette.middleware.cors",
    "starlette.staticfiles",
    "starlette.responses",

    # Uvicorn event loop internals
    "uvicorn.logging",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",

    # MLX
    "mlx",
    "mlx.core",
    "mlx_whisper",
    "mlx_whisper.load_models",
    "mlx_whisper.transcribe",

    # PyObjC / rumps
    "rumps",
    "objc",
    "AppKit",
    "Foundation",
    "Cocoa",

    # Standard library used at runtime
    "multiprocessing.pool",
    "email.mime.text",
    "email.mime.multipart",

    # local_asr_server modules
    "local_asr_server",
    "local_asr_server.server",
    "local_asr_server.cli",
    "local_asr_server.menubar",
    "local_asr_server.window",
    "local_asr_server.paths",
    "local_asr_server.settings",
    "local_asr_server.recordings",
    "local_asr_server.transcriptions",
    "local_asr_server.audio_router",
    "local_asr_server.llm",
    "local_asr_server.launchd",
    "local_asr_server.macos_audio_helper",
    "local_asr_server.macos_audio_helper.compile",
    "local_asr_server.native_capture",
    "local_asr_server.native_capture_helper",
    "local_asr_server.native_capture_helper.compile",
    "local_asr_server.audio_diagnostics",
    "local_asr_server.transcription_jobs",
]

# ── Exclude heavy dev/test packages ───────────────────────────────────────────

excludes = [
    "tkinter",
    "test",
    "pytest",
    "IPython",
    "jupyter",
    "notebook",
    "matplotlib",
]

# ── PyInstaller Analysis ───────────────────────────────────────────────────────

a = Analysis(                                                           # noqa: F821
    [str(INSTALLED_PKG_DIR / "menubar.py")],                  # entry point
    pathex=[],
    binaries=extra_binaries,
    datas=extra_datas,
    hiddenimports=hidden_imports,
    hookspath=[str(BUILD_ASSETS / "hooks")] if (BUILD_ASSETS / "hooks").exists() else [],
    hooksconfig={},
    runtime_hooks=[
        # Pre-loads libmlx.dylib from mlx/lib/ before any user import so that
        # MLX's dladdr-based metallib resolution points to the correct bundle path.
        str(BUILD_ASSETS / "hooks" / "pyi_rth_mlx.py"),
    ],
    excludes=excludes,
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure)                                                       # noqa: F821

exe = EXE(                                                              # noqa: F821
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ClosedRoom",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,                      # no terminal window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch="arm64",
    codesign_identity=None,             # ad-hoc signing via build.sh
    entitlements_file=str(PROJECT_ROOT / "build_assets" / "entitlements.plist"),
)

coll = COLLECT(                                                         # noqa: F821
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="ClosedRoom",
)

# ── BUNDLE: produce the .app ───────────────────────────────────────────────────

# Icon: use .icns from build_assets if available, else None
icns_path = BUILD_ASSETS / "icon.icns"

app = BUNDLE(                                                           # noqa: F821
    coll,
    name="ClosedRoom.app",
    icon=str(icns_path) if icns_path.exists() else None,
    bundle_identifier="com.closedroom.app",
    version=APP_VERSION,
    info_plist={
        # Run as a regular application (visible in Dock when running, stays in menu bar)
        "LSUIElement": False,
        "CFBundleName": "ClosedRoom",
        "CFBundleDisplayName": "ClosedRoom",
        "CFBundleIdentifier": "com.closedroom.app",
        "CFBundleVersion": APP_VERSION,
        "CFBundleShortVersionString": APP_VERSION,
        "NSHumanReadableCopyright": "© 2026 ClosedRoom",
        "NSHighResolutionCapable": True,
        "NSMicrophoneUsageDescription":
            "ClosedRoom needs microphone access to record meetings.",
        "NSAudioCaptureUsageDescription":
            "ClosedRoom records computer audio to transcribe meetings and local audio sources.",
        "NSScreenCaptureUsageDescription":
            "ClosedRoom needs screen and system audio capture access for native recording.",
        "NSAppleEventsUsageDescription":
            "ClosedRoom uses AppleScript to open folder selection dialogs.",
        # Minimum macOS version (MLX requires 14+)
        "LSMinimumSystemVersion": "14.0",
    },
)
