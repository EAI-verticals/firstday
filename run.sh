#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
app_mode="${1:-dev}"
app_port="${2:-3001}"
if ! [[ "$app_port" =~ ^[0-9]+$ ]] || (( app_port < 1 || app_port > 65535 )); then
  echo "Use a port between 1 and 65535." >&2
  exit 1
fi
case "$app_mode" in
  dev) exec npm run dev:no-turbo -- --hostname 127.0.0.1 --port "$app_port" ;;
  test) exec npm test -- --runInBand ;;
  prod) exec npm run start:prod -- --hostname 127.0.0.1 --port "$app_port" ;;
  *) echo "Usage: ./run.sh [dev|test|prod] [port]" >&2; exit 1 ;;
esac
