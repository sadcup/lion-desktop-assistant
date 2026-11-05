#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
export HOST_UID="$(id -u)" HOST_GID="$(id -g)" DESKTOP_HOME="$HOME"
mkdir -p bolt/assistant/data bolt/assistant/run
exec docker compose "$@"
