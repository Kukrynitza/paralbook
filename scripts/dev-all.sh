#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x solver/.venv/bin/uvicorn ]]; then
  echo "Сначала: python3 -m venv solver/.venv && solver/.venv/bin/pip install -r solver/requirements.txt" >&2
  exit 1
fi
trap 'kill 0' EXIT
solver/.venv/bin/uvicorn solver.app:app --host 127.0.0.1 --port 8000 &
next dev --port 5173
