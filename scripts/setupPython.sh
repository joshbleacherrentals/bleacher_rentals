#!/usr/bin/env bash
# Builds .venv with the same Python minor version Vercel uses (.python-version),
# then installs requirements-dev.txt. Run with: npm run setup:py
set -euo pipefail
cd "$(dirname "$0")/.."

want="$(tr -d '[:space:]' < .python-version)"
py="python${want}"

if ! command -v "$py" >/dev/null 2>&1; then
  echo "Python ${want} is required (.python-version) but '${py}' was not found." >&2
  echo "Install it, e.g. on macOS: brew install python@${want}" >&2
  exit 1
fi

rm -rf .venv
"$py" -m venv .venv
.venv/bin/pip install -q --disable-pip-version-check -r requirements-dev.txt
echo "Ready: $(.venv/bin/python --version) in .venv"
