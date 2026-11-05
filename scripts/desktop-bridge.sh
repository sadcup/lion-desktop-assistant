#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if [ -z "${DISPLAY:-}" ]; then
  echo "Run the desktop bridge from the logged-in Linux X11 session (DISPLAY is unset)." >&2
  exit 1
fi
exec "${LION_PYTHON:-/usr/bin/python3}" bolt/assistant/bridge.py
