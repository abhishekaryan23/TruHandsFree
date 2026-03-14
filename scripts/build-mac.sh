#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
SMOKE_PORT="${TRUHANDSFREE_SMOKE_PORT:-18055}"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  TruHandsFree — macOS Release Build"
echo "═══════════════════════════════════════════════════════"
echo ""

echo "→ Preparing macOS build assets..."
bash "$PROJECT_ROOT/scripts/prepare-mac-assets.sh"

echo ""
echo "→ Building Python backend bundle..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
    echo "✗ No backend virtualenv found."
    echo "  Run: python3 -m venv backend/.venv && source backend/.venv/bin/activate && pip install -r backend/requirements.txt"
    exit 1
fi

source .venv/bin/activate
pip install --quiet -r requirements.txt

pyinstaller truhandsfree-engine.spec --clean --noconfirm

BACKEND_EXEC="$BACKEND_DIR/dist/truhandsfree-engine/truhandsfree-engine"
if [ ! -f "$BACKEND_EXEC" ]; then
    echo "✗ PyInstaller build failed. Expected executable missing: $BACKEND_EXEC"
    exit 1
fi

echo "  ✓ Backend bundle ready at $BACKEND_EXEC"
echo ""

echo "→ Smoke-testing bundled backend on port $SMOKE_PORT..."
"$BACKEND_EXEC" --port "$SMOKE_PORT" >/tmp/truhandsfree-backend.log 2>&1 &
BACKEND_PID=$!
cleanup() {
    kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in {1..60}; do
    if curl -s --max-time 2 "http://127.0.0.1:$SMOKE_PORT/health" | grep -q "ok"; then
        echo "  ✓ Backend health check passed."
        break
    fi
    sleep 1
done

if ! curl -s --max-time 3 "http://127.0.0.1:$SMOKE_PORT/health" | grep -q "ok"; then
    echo "✗ Backend smoke test failed."
    cat /tmp/truhandsfree-backend.log
    exit 1
fi

cleanup
trap - EXIT
echo ""

echo "→ Building signed/notarized Electron DMG..."
cd "$FRONTEND_DIR"
npm ci
npm run build:mac

APP_PATH="$(find dist/mac-arm64 -maxdepth 1 -name 'TruHandsFree.app' | head -1)"
DMG_PATH="$(find dist -maxdepth 1 -name '*.dmg' | head -1)"

if [ -z "$APP_PATH" ] || [ -z "$DMG_PATH" ]; then
    echo "✗ Build completed without a .app or .dmg output."
    exit 1
fi

if [ -n "${APPLE_SIGNING_IDENTITY:-${CSC_NAME:-}}" ]; then
    echo ""
    echo "→ Verifying code signing..."
    codesign --verify --deep --strict "$APP_PATH"
    spctl --assess --type execute --verbose "$APP_PATH"
fi

if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    echo ""
    echo "→ Validating stapled notarization ticket..."
    xcrun stapler validate "$APP_PATH"
    xcrun stapler validate "$DMG_PATH"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✓ Release build complete"
echo "  App: $APP_PATH"
echo "  DMG: $DMG_PATH"
echo "═══════════════════════════════════════════════════════"
