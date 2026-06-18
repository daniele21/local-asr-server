"""
pyi_rth_mlx.py — PyInstaller runtime hook for MLX.

This script runs inside the PyInstaller bootloader environment before any
user code is imported.  It pre-loads libmlx.dylib from the bundled mlx/lib/
directory so that MLX's internal dladdr-based metallib resolution produces
a correct path.

Without this, mlx.core (loaded as a .so extension) uses dladdr() to find
its own on-disk location and then calculates mlx.metallib as a sibling path.
In a PyInstaller onefile bundle the .so is extracted to a temp directory, but
the loader may still report the original executable path — causing the
metallib lookup to fail with "Failed to load the default metallib."

By pre-loading libmlx.dylib via ctypes.CDLL() before any MLX Python code
runs, we pin the dladdr result to the extracted temp path where mlx.metallib
is also present.
"""

import os
import sys
import ctypes
from pathlib import Path

# Only apply inside a PyInstaller frozen bundle.
if not (getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS")):
    pass  # dev mode — nothing to do
else:
    _meipass = Path(sys._MEIPASS)  # type: ignore[attr-defined]
    _mlx_lib = _meipass / "mlx" / "lib"

    if _mlx_lib.exists():
        # 1. Expose the bundled dylibs so the dynamic linker can find them.
        #    (DYLD_LIBRARY_PATH is sanitized by SIP for hardened runtimes, but
        #    an explicit ctypes.CDLL() call always works.)
        _libmlx = _mlx_lib / "libmlx.dylib"
        _libjaccl = _mlx_lib / "libjaccl.dylib"

        for _lib in (_libjaccl, _libmlx):   # load jaccl first (dependency)
            if _lib.exists():
                try:
                    ctypes.CDLL(str(_lib))
                except OSError:
                    pass  # non-fatal; MLX will try its own resolution

        # 2. As a secondary measure, set DYLD_FALLBACK_LIBRARY_PATH which is
        #    not stripped by SIP for ad-hoc-signed binaries.
        _existing = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
        _paths = [str(_mlx_lib)]
        if _existing:
            _paths.append(_existing)
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = ":".join(_paths)
