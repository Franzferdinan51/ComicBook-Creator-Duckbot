#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Comic Studio — double-click to launch the WebUI
# Runs from the repo root; opens http://localhost:3008
# ─────────────────────────────────────────────────────────────

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Check node is available
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed."
  echo "Download it at https://nodejs.org"
  read -p "Press Enter to exit…"
  exit 1
fi

# Check node version
NODE_VERSION=$(node -v | sed 's/v//')
REQUIRED="20.0.0"
if [ "$(printf '%s\n' "$REQUIRED" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED" ]; then
  echo "Error: Node.js $NODE_VERSION detected. Version $REQUIRED or higher is required."
  read -p "Press Enter to exit…"
  exit 1
fi

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies…"
  npm install --no-audit --no-fund
  if [ $? -ne 0 ]; then
    echo "Error: npm install failed."
    read -p "Press Enter to exit…"
    exit 1
  fi
fi

# Start the server
echo ""
echo "🚀 Starting Comic Studio…"
echo "   Opening http://localhost:3008"
echo "   Press Ctrl+C to stop"
echo ""
node --import=tsx/esm src/server/index.ts
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "Server exited with code $EXIT_CODE."
fi

read -p "Press Enter to close…"