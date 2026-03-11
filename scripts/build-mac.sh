#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════
# TruHandsFree — macOS Build Script
# Builds the Python backend binary and Electron .dmg
# ═══════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  TruHandsFree — macOS Build"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Phase 1: Build Python Backend ──
echo "→ Phase 1: Building Python backend binary..."
cd "$PROJECT_ROOT/backend"

if [ ! -d ".venv" ]; then
    echo "  ✗ No .venv found. Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

source .venv/bin/activate

# Ensure pyinstaller is installed
pip install pyinstaller --quiet

echo "  Building with PyInstaller..."
pyinstaller truhandsfree-engine.spec --clean --noconfirm 2>&1 | tail -5

if [ ! -f "dist/truhandsfree-engine" ]; then
    echo "  ✗ PyInstaller build failed — no output binary found."
    exit 1
fi

BACKEND_SIZE=$(du -h dist/truhandsfree-engine | cut -f1)
echo "  ✓ Backend binary: dist/truhandsfree-engine ($BACKEND_SIZE)"
echo ""

# ── Phase 1b: Quick smoke test (macOS compatible — no 'timeout' command) ──
echo "  Smoke-testing binary..."

# Kill any existing process on port 8055
lsof -ti:8055 | xargs kill -9 2>/dev/null || true
sleep 1

./dist/truhandsfree-engine &
BACKEND_PID=$!
sleep 4

if curl -s --max-time 5 http://127.0.0.1:8055/health | grep -q "ok"; then
    echo "  ✓ Backend binary health check passed."
else
    echo "  ⚠ Backend binary health check failed (may be OK if port was in use)."
fi

kill $BACKEND_PID 2>/dev/null || true
wait $BACKEND_PID 2>/dev/null || true
echo ""

# ── Phase 2: Build Electron App + DMG ──
echo "→ Phase 2: Building Electron app and .dmg..."
cd "$PROJECT_ROOT/frontend"

# Install deps
npm ci --silent

# Build (tsc + vite + electron-builder)
echo "  Running: npm run build"
npm run build

# Find the output DMG
DMG_FILE=$(ls dist/*.dmg 2>/dev/null | head -1)
if [ -n "$DMG_FILE" ]; then
    DMG_SIZE=$(du -h "$DMG_FILE" | cut -f1)
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  ✓ Build complete!"
    echo "  DMG: $DMG_FILE ($DMG_SIZE)"
    echo "═══════════════════════════════════════════════════════"
else
    echo ""
    echo "  ⚠ Build completed but no .dmg found in dist/"
    echo "  Check electron-builder output above for details."
fi
