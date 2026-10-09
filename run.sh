#!/usr/bin/env bash
# Start CivicPulse: API on :8000, dashboard on :5173.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d backend/.venv ]; then
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install)
fi
if [ ! -f backend/civicpulse.db ]; then
  [ -f data/synthetic_complaints.csv ] || backend/.venv/bin/python scripts/generate_synthetic.py
  backend/.venv/bin/python scripts/seed.py
fi

trap 'kill 0' EXIT
(cd backend && .venv/bin/uvicorn app.main:app --port 8000 --reload) &
(cd frontend && npx vite --port 5173) &
echo "CivicPulse running -> http://localhost:5173   (API docs: http://localhost:8000/docs)"
wait
