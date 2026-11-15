#!/usr/bin/env bash
# One-time install of the burnrate API on the team's Oracle server (run there as opc).
#   bash apps/api/deploy/setup.sh        (from any copy of the repo; it installs from GitHub main)
# Makes a separate clean copy of the repo in /opt/burnrate-api (never edited by hand) with its
# own Python and the pinned packages, installs the service and the 5-minute update timer, and
# opens port 8000 in the host firewall. The Oracle Cloud network rules must also allow TCP 8000
# (OCI console, security list).
#
# Why /opt and not the home folder: the server runs SELinux in enforcing mode, which does not let
# systemd start programs labelled as home files (user_home_t): the service failed with
# "Permission denied" on ~/burnrate-api/.venv/bin/uvicorn. Under /opt the files get the system
# label, so the service may run them. Python is installed inside /opt/burnrate-api/python for
# the same reason (uv's default Python lives in ~/.local).
# Code generated with SI assistance (Claude Code), reviewed by the team.
set -euo pipefail
DIR=/opt/burnrate-api
REPO=git@github.com:d0br1n/nasa-space-apps-challenge.git
UV_HOME=/home/opc/.local/bin/uv

sudo mkdir -p "$DIR"
sudo chown opc:opc "$DIR"
if [ ! -d "$DIR/.git" ]; then
  git clone --quiet "$REPO" "$DIR/src.tmp"
  shopt -s dotglob && mv "$DIR"/src.tmp/* "$DIR"/ && rmdir "$DIR/src.tmp"
fi
cd "$DIR"
git fetch --quiet origin main && git reset --quiet --hard origin/main

# uv itself and a Python 3.12 that both live under /opt.
mkdir -p "$DIR/bin"
install -m 755 "$UV_HOME" "$DIR/bin/uv"
export UV_PYTHON_INSTALL_DIR="$DIR/python" UV_PYTHON_PREFERENCE=only-managed UV_CACHE_DIR="$DIR/.uv-cache"
rm -rf "$DIR/.venv"
"$DIR/bin/uv" venv --quiet --python 3.12 "$DIR/.venv"
"$DIR/bin/uv" pip install --quiet --python "$DIR/.venv/bin/python" -r apps/api/requirements.txt
chmod +x apps/api/deploy/update.sh

# Give everything the default /opt labels (SELinux), so systemd may start it.
if command -v restorecon >/dev/null; then
  sudo restorecon -R "$DIR"
  # The interpreter systemd starts gets the label of system programs.
  sudo chcon -R -t bin_t "$DIR/python" "$DIR/.venv/bin" "$DIR/bin"
fi

sudo install -m 644 apps/api/deploy/burnrate-api.service /etc/systemd/system/
sudo install -m 644 apps/api/deploy/burnrate-api-update.service /etc/systemd/system/
sudo install -m 644 apps/api/deploy/burnrate-api-update.timer /etc/systemd/system/
echo 'opc ALL=(root) NOPASSWD: /usr/bin/systemctl restart burnrate-api' | sudo tee /etc/sudoers.d/burnrate-api >/dev/null
sudo chmod 440 /etc/sudoers.d/burnrate-api
sudo systemctl daemon-reload
sudo systemctl enable burnrate-api burnrate-api-update.timer
sudo systemctl restart burnrate-api
sudo systemctl start burnrate-api-update.timer
if systemctl is-active --quiet firewalld; then
  sudo firewall-cmd --quiet --permanent --add-port=8000/tcp && sudo firewall-cmd --quiet --reload
fi

# The API loads the catalog at start: give it up to 30 seconds.
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/api/v1/health >/tmp/burnrate-health.json 2>/dev/null; then
    head -c 300 /tmp/burnrate-health.json; echo
    echo "burnrate-api is running at http://127.0.0.1:8000 ($(git log --oneline -1))"
    exit 0
  fi
  sleep 1
done
echo "burnrate-api did not answer within 30 s. Last log lines:"
sudo journalctl -u burnrate-api --no-pager -n 20
exit 1
