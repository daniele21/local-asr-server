"""
hook-mlx.py — PyInstaller hook for the mlx package.

MLX ships native Metal extensions and dylibs that PyInstaller doesn't
collect automatically because they live outside the standard Python import
path.  This hook ensures they are bundled into the .app with the correct
directory structure.

IMPORTANT: the mlx/lib/ directory must be preserved as-is because
libmlx.dylib uses dladdr at runtime to locate mlx.metallib as a sibling
file.  If libmlx.dylib lands in the bundle root (Contents/Frameworks/)
rather than in mlx/lib/, the relative path calculation fails and MLX
raises "Failed to load the default metallib."
"""

from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

# Collect Python source files (json, pyi stubs, etc.) from mlx.
# exclude_includes=True skips mlx's own include/ headers (not needed at runtime).
datas = collect_data_files("mlx", include_py_files=True)

# Collect Python-extension .so files (mlx.core etc.) via the standard hook,
# but keep MLX's own dylibs out of the generic root bundle path.  The only
# canonical copies of libmlx.dylib/libjaccl.dylib must live in mlx/lib/ so
# dladdr-based metallib lookup resolves against mlx.metallib in the same tree.
binaries = [
    entry
    for entry in collect_dynamic_libs("mlx")
    if Path(entry[0]).name not in {"libmlx.dylib", "libjaccl.dylib"}
]

# Explicitly bundle mlx/lib/ with the correct destination path so that
# libmlx.dylib, libjaccl.dylib and mlx.metallib all land in mlx/lib/
# inside the bundle.  This mirrors the wheel layout that MLX expects.
try:
    import mlx
    # mlx is a namespace package: __file__ is None; use __spec__ instead.
    mlx_search = mlx.__spec__.submodule_search_locations  # type: ignore[union-attr]
    mlx_dir = Path(next(iter(mlx_search))) if mlx_search else None

    if mlx_dir and (mlx_dir / "lib").exists():
        mlx_lib = mlx_dir / "lib"

        for entry in mlx_lib.iterdir():
            dest = "mlx/lib"
            if entry.suffix in {".dylib", ".so"}:
                # Ship dylibs with their correct mlx/lib/ path so that
                # dladdr-based resolution inside libmlx.dylib works.
                binaries.append((str(entry), dest))
            elif entry.is_file():
                # mlx.metallib and any other non-dylib resources.
                datas.append((str(entry), dest))
            elif entry.is_dir():
                # cmake/ subdirectory – include recursively (cmake config files).
                for sub in entry.rglob("*"):
                    if sub.is_file():
                        rel = sub.parent.relative_to(mlx_lib)
                        datas.append((str(sub), f"mlx/lib/{rel}"))
except Exception:
    pass
# Declare the MLX runtime hook so PyInstaller runs it before any user import.
# The hook pre-loads libmlx.dylib from the bundled mlx/lib/ directory to fix
# metallib resolution inside the PyInstaller onefile/onedir bundle.
try:
    from pathlib import Path as _Path
    _this_dir = _Path(__file__).parent
    _rth = _this_dir / "pyi_rth_mlx.py"
    if _rth.exists():
        # runtime_hooks is a module-level variable read by PyInstaller
        runtime_hooks = [str(_rth)]
except Exception:
    pass
