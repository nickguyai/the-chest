#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${PROJECT_ROOT}/.venv"

echo "=> Ensuring \`uv\` is available"
if ! command -v uv >/dev/null 2>&1; then
    python3 -m pip install --user --upgrade uv
fi

echo "=> Creating virtual environment in ${VENV_DIR}"
uv venv "${VENV_DIR}"

echo "=> Installing Python dependencies with uv"
uv pip install \
    --python "${VENV_DIR}/bin/python" \
    --upgrade \
    playwright \
    requests

echo "=> Installing Playwright Chromium browser binary"
"${VENV_DIR}/bin/playwright" install chromium

echo "Setup complete. Activate the environment with:"
echo "  source ${VENV_DIR}/bin/activate"
