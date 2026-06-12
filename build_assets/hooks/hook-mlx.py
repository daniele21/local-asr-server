"""
hook-mlx.py — PyInstaller hook for the mlx package.

MLX ships native Metal extensions and dylibs that PyInstaller doesn't
collect automatically because they live outside the standard Python import
path.  This hook ensures they are bundled into the .app.
"""

from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

# Collect all data files (json, pyi, etc.) from mlx
datas = collect_data_files("mlx", include_py_files=True)

# Collect native extensions (.so) and dylibs
binaries = collect_dynamic_libs("mlx")

# Also explicitly grab the lib/ directory (libmlx.dylib, libjaccl.dylib, etc.)
try:
    import mlx
    mlx_dir = Path(mlx.__file__).parent if mlx.__file__ else None
    if mlx_dir and (mlx_dir / "lib").exists():
        for dylib in (mlx_dir / "lib").glob("*.dylib"):
            binaries.append((str(dylib), "."))
except Exception:
    pass
