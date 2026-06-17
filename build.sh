#!/usr/bin/env bash
# =============================================================================
# build.sh — ClosedRoom macOS App Build Script
#
# Produces:  dist/ClosedRoom.app   (self-contained .app bundle)
#            dist/ClosedRoom.dmg   (distributable disk image)
#
# Usage:
#   ./build.sh               # full build
#   ./build.sh --no-dmg      # skip DMG creation
#   ./build.sh --clean       # clean build artifacts first
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
APP_NAME="ClosedRoom"
APP_VERSION="1.0.0"
BUNDLE_ID="com.closedroom.app"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_ASSETS="$SCRIPT_DIR/build_assets"
DIST_DIR="$SCRIPT_DIR/dist"
APP_PATH="$DIST_DIR/$APP_NAME.app"
DMG_PATH="$DIST_DIR/$APP_NAME.dmg"
CREATE_DMG=true
CLEAN_BUILD=false

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}▸ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# ── Parse arguments ───────────────────────────────────────────────────────────
for arg in "$@"; do
    case $arg in
        --no-dmg)  CREATE_DMG=false ;;
        --clean)   CLEAN_BUILD=true ;;
    esac
done

# ── Sanity checks ─────────────────────────────────────────────────────────────
[[ "$(uname)" == "Darwin" ]] || die "Build is only supported on macOS."
[[ "$(uname -m)" == "arm64" ]] || die "Build requires Apple Silicon (arm64)."

command -v uv       >/dev/null 2>&1 || die "uv not found. Install: curl -Ls https://astral.sh/uv | sh"
command -v swiftc   >/dev/null 2>&1 || die "swiftc not found. Install Xcode Command Line Tools: xcode-select --install"


echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Building $APP_NAME v$APP_VERSION"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Clean ─────────────────────────────────────────────────────────────────────
if $CLEAN_BUILD; then
    log "Cleaning previous build artifacts..."
    rm -rf "$DIST_DIR" build/ __pycache__ build_venv
    ok "Cleaned"
fi

mkdir -p "$BUILD_ASSETS"

# ── Step 0: Build React frontend ──────────────────────────────────────────────
log "Step 0/5: Building React + Tailwind v4 frontend with pnpm..."
if ! command -v pnpm &> /dev/null; then
    die "pnpm not found. Please install it: npm install -g pnpm"
fi
cd "$SCRIPT_DIR/frontend"
pnpm install
pnpm run build
cd "$SCRIPT_DIR"
ok "React frontend built successfully"

# ── Step 1: Compile Swift audio helper ────────────────────────────────────────
log "Step 1/5: Compiling Swift audio helper..."

HELPER_CACHE="$SCRIPT_DIR/.cache/audio-helper/audio-helper"
HELPER_DEST="$BUILD_ASSETS/audio-helper"

if [[ -f "$HELPER_CACHE" ]] && [[ -f "$SCRIPT_DIR/.cache/audio-helper/source.sha256" ]]; then
    SOURCE_HASH=$(shasum -a 256 "$SCRIPT_DIR/src/local_asr_server/macos_audio_helper/audio_helper.swift" | awk '{print $1}')
    CACHED_HASH=$(cat "$SCRIPT_DIR/.cache/audio-helper/source.sha256")
    if [[ "$SOURCE_HASH" == "$CACHED_HASH" ]]; then
        ok "Audio helper binary is up-to-date (cache hit)"
        cp "$HELPER_CACHE" "$HELPER_DEST"
    else
        log "Source changed, recompiling..."
        uv run local-asr setup-audio
        cp "$HELPER_CACHE" "$HELPER_DEST"
    fi
else
    log "Compiling for the first time..."
    uv run local-asr setup-audio
    cp "$HELPER_CACHE" "$HELPER_DEST"
fi
chmod +x "$HELPER_DEST"
ok "Audio helper: $HELPER_DEST ($(du -sh "$HELPER_DEST" | cut -f1))"

NATIVE_HELPER_CACHE="$SCRIPT_DIR/.cache/native-capture-helper/native-capture-helper"
NATIVE_HELPER_DEST="$BUILD_ASSETS/native-capture-helper"
log "  Compiling native capture helper..."
uv run python -c "from local_asr_server.native_capture_helper.compile import compile_helper; compile_helper(force=False)"
cp "$NATIVE_HELPER_CACHE" "$NATIVE_HELPER_DEST"
chmod +x "$NATIVE_HELPER_DEST"
ok "Native capture helper: $NATIVE_HELPER_DEST ($(du -sh "$NATIVE_HELPER_DEST" | cut -f1))"

# ── Step 2: Bundle ffmpeg ──────────────────────────────────────────────────────
log "Step 2/5: Bundling ffmpeg..."

FFMPEG_DEST="$BUILD_ASSETS/ffmpeg"
FFMPEG_LIB_DIR="$BUILD_ASSETS/lib"
mkdir -p "$FFMPEG_LIB_DIR"

FFMPEG_SRC=$(which ffmpeg 2>/dev/null || echo "")
if [[ -z "$FFMPEG_SRC" ]]; then
    die "ffmpeg not found. Install it with: brew install ffmpeg"
fi

# Resolve symlink
FFMPEG_SRC=$(python3 -c "import os; print(os.path.realpath('$FFMPEG_SRC'))")
rm -f "$FFMPEG_DEST"
cp "$FFMPEG_SRC" "$FFMPEG_DEST"
chmod 755 "$FFMPEG_DEST"


# Collect all Homebrew dylibs that ffmpeg depends on (excluding system libs)
log "  Collecting ffmpeg dylibs..."
collect_dylibs() {
    local binary="$1"
    local visited=""
    local -a queue=("$binary")

    while [[ ${#queue[@]} -gt 0 ]]; do
        local current="${queue[0]}"
        queue=("${queue[@]:1}")

        # Skip if already visited
        if [[ "$visited" == *"$current"* ]]; then
            continue
        fi
        visited="$visited|$current"

        # Get dependencies
        while IFS= read -r dep; do
            dep=$(echo "$dep" | awk '{print $1}' | xargs 2>/dev/null || echo "")
            [[ -z "$dep" ]] && continue
            # Only collect Homebrew libs (not system)
            if [[ "$dep" == /opt/homebrew/* ]] || [[ "$dep" == /usr/local/* ]]; then
                local dest_name
                dest_name=$(basename "$dep")
                if [[ -f "$dep" ]] && [[ ! -f "$FFMPEG_LIB_DIR/$dest_name" ]]; then
                    cp "$dep" "$FFMPEG_LIB_DIR/$dest_name"
                    queue+=("$dep")
                fi
            fi
        done < <(otool -L "$current" 2>/dev/null | tail -n +2)
    done
}

collect_dylibs "$FFMPEG_SRC"
DYLIB_COUNT=$(ls "$FFMPEG_LIB_DIR" | wc -l | tr -d ' ')

# Fix the rpath inside ffmpeg to find its dylibs relative to itself
# All dylibs will be placed next to ffmpeg in the bundle (Contents/MacOS/)
for dylib in "$FFMPEG_LIB_DIR"/*.dylib; do
    dylib_name=$(basename "$dylib")
    install_name_tool -change \
        "/opt/homebrew/Cellar/ffmpeg/"* \
        "@executable_path/$dylib_name" \
        "$FFMPEG_DEST" 2>/dev/null || true
done

ok "ffmpeg bundled with $DYLIB_COUNT dylibs"

# ── Step 3: Generate icon.icns ────────────────────────────────────────────────
log "Step 3/5: Generating icon.icns..."

ICNS_PATH="$BUILD_ASSETS/icon.icns"
SVG_SOURCE="$SCRIPT_DIR/src/local_asr_server/static/logo-dark.svg"
ICONSET_DIR="$BUILD_ASSETS/ClosedRoom.iconset"

if [[ -f "$SVG_SOURCE" ]]; then
    mkdir -p "$ICONSET_DIR"

    # Convert SVG → PNG at various sizes using sips + rsvg-convert (if available) or qlmanage
    if command -v rsvg-convert >/dev/null 2>&1; then
        CONVERT_CMD="rsvg-convert"
    else
        warn "rsvg-convert not found (install: brew install librsvg). Using qlmanage fallback."
        CONVERT_CMD="qlmanage"
    fi

    declare -a SIZES=(16 32 64 128 256 512 1024)
    for size in "${SIZES[@]}"; do
        out="$ICONSET_DIR/icon_${size}x${size}.png"
        if [[ "$CONVERT_CMD" == "rsvg-convert" ]]; then
            rsvg-convert -w "$size" -h "$size" "$SVG_SOURCE" -o "$out" 2>/dev/null || true
        else
            # Fallback: use sips on a large PNG placeholder
            sips -s format png "$SVG_SOURCE" --out "$out" --resampleWidth "$size" 2>/dev/null || true
        fi
    done

    # Create @2x versions
    for size in 16 32 128 256 512; do
        double=$((size * 2))
        src="$ICONSET_DIR/icon_${double}x${double}.png"
        dst="$ICONSET_DIR/icon_${size}x${size}@2x.png"
        if [[ -f "$src" ]]; then
            cp "$src" "$dst"
        fi
    done

    # iconutil requires valid PNGs — if generation failed, create a placeholder
    VALID_PNGS=$(ls "$ICONSET_DIR"/*.png 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$VALID_PNGS" -gt 0 ]]; then
        iconutil -c icns "$ICONSET_DIR" -o "$ICNS_PATH" 2>/dev/null && ok "icon.icns generated" || warn "iconutil failed, using no icon"
    else
        warn "Could not generate PNG icons — building without custom icon"
    fi
    rm -rf "$ICONSET_DIR"
else
    warn "Logo SVG not found at $SVG_SOURCE — building without custom icon"
fi

# ── Step 4: PyInstaller ───────────────────────────────────────────────────────
log "Step 4/5: Running PyInstaller..."

cd "$SCRIPT_DIR"

log "  Building python wheel..."
rm -rf dist/wheels
uv build --wheel --out-dir dist/wheels/

log "  Creating clean build virtual environment..."
rm -rf build_venv
uv venv build_venv --color always

log "  Installing wheel and dependencies into build_venv..."
# Installs local_asr_server wheel with [app] dependencies + pyinstaller
WHEEL_FILE=$(ls dist/wheels/local_asr_server-*.whl)
uv pip install --python build_venv "${WHEEL_FILE}[app]" "pyinstaller>=6.0"

log "  Running PyInstaller from build_venv..."
build_venv/bin/pyinstaller \
    --clean \
    --noconfirm \
    ClosedRoom.spec



if [[ ! -d "$APP_PATH" ]]; then
    die "PyInstaller did not produce $APP_PATH"
fi
ok "App bundle: $APP_PATH"

# ── Post-processing: fix permissions & ad-hoc code sign ──────────────────────
log "  Fixing permissions..."
find "$APP_PATH" -name "*.dylib" -exec chmod 755 {} \;
find "$APP_PATH" -name "*.so" -exec chmod 755 {} \;
chmod +x "$APP_PATH/Contents/MacOS/$APP_NAME"
chmod +x "$APP_PATH/Contents/MacOS/audio-helper" 2>/dev/null || true
chmod +x "$APP_PATH/Contents/MacOS/native-capture-helper" 2>/dev/null || true
chmod +x "$APP_PATH/Contents/MacOS/ffmpeg" 2>/dev/null || true

log "  Applying ad-hoc code signature..."
ENTITLEMENTS="$BUILD_ASSETS/entitlements.plist"
codesign --force --deep --sign - \
    --entitlements "$ENTITLEMENTS" \
    --options runtime \
    "$APP_PATH" \
    && ok "Ad-hoc signed" \
    || warn "codesign failed — app may show Gatekeeper warnings"


APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
ok "ClosedRoom.app ($APP_SIZE)"

# ── Step 5: Create DMG ────────────────────────────────────────────────────────
if $CREATE_DMG; then
    log "Step 5/5: Creating DMG..."
    ./create_dmg.sh "$APP_PATH" "$DMG_PATH" "$APP_NAME" "$APP_VERSION"
else
    log "Step 5/5: Skipping DMG (--no-dmg)"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
ok "$APP_NAME v$APP_VERSION built successfully!"
echo ""
echo "  App:  $APP_PATH"
$CREATE_DMG && echo "  DMG:  $DMG_PATH" || true
echo ""
echo "  To test locally:"
echo "    open $APP_PATH"
echo ""
echo "  To install:"
echo "    cp -r $APP_PATH /Applications/"
echo "═══════════════════════════════════════════════════════════"
