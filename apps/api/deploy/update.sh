#!/usr/bin/env bash
# Follow origin/main: fetch, and if main moved, reset the deploy copy to it, reinstall the
# pinned packages and restart the API. The deploy copy is never edited by hand.
# Code generated with SI assistance (Claude Code), reviewed by the team.
set -euo pipefail
cd /opt/burnrate-api
git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0
fi
git reset --quiet --hard origin/main
UV_PYTHON_INSTALL_DIR=/opt/burnrate-api/python UV_PYTHON_PREFERENCE=only-managed UV_CACHE_DIR=/opt/burnrate-api/.uv-cache /opt/burnrate-api/bin/uv pip install --quiet --python .venv/bin/python -r apps/api/requirements.txt
sudo /usr/bin/systemctl restart burnrate-api
echo "burnrate-api now at $(git log --oneline -1)"
