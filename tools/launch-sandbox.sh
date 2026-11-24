#!/usr/bin/env bash
# Start Antigravity on macOS isolated from the user's own data, with CDP enabled, for checking the translation.
#   ./tools/launch-sandbox.sh [port] [extra args...]
# Stop it with: kill <pid>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-9333}"
if [ $# -gt 0 ]; then shift; fi

ROOT="${ANTIGRAVITY_SANDBOX_ROOT:-$SCRIPT_DIR/../tmp/sandbox}"
EXE="${ANTIGRAVITY_DIR:-/Applications/Antigravity.app}/Contents/MacOS/Antigravity"
UD="$ROOT/userdata"
mkdir -p "$UD"

"$EXE" --user-data-dir="$UD" --remote-debugging-port="$PORT" "$@" >/dev/null 2>&1 &
echo "PID=$!"
