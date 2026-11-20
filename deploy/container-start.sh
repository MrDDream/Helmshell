#!/usr/bin/env bash
# Starts Helmshell inside its container (started as root, see deploy/docker-compose.yml):
# 1. installs python3, tmux and git if they are missing (the ghcr.io image already has them; the plain
#    ubuntu image used for development installs them on first start). tmux should match the host's
#    version: the container drives the host's tmux server through its socket;
# 2. recreates the host user (same UID, GID and home directory);
# 3. runs Helmshell as that user (root privileges are dropped).
set -euo pipefail

: "${HOST_USER:?HOST_USER is missing: your user name on the host}"
HOST_UID="${HOST_UID:-1000}"
HOST_GID="${HOST_GID:-1000}"
HOST_HOME="${HOST_HOME:-/home/$HOST_USER}"
# Helmshell's code: HELMSHELL_DIR (set to /opt/helmshell in the image), otherwise the directory that
# contains this script's folder (code mounted from the host).
APP_DIR="${HELMSHELL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

if ! command -v python3 >/dev/null || ! command -v tmux >/dev/null || ! command -v git >/dev/null; then
  echo "[helmshell] Installing python3, tmux and git…"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
    python3 tmux git openssh-client ca-certificates locales-all >/dev/null
  rm -rf /var/lib/apt/lists/*
fi

# git and ssh read the home directory from /etc/passwd, not from $HOME.
group="$(getent group "$HOST_GID" | cut -d: -f1 || true)"
if [ -z "$group" ]; then
  groupadd -g "$HOST_GID" "$HOST_USER"
elif [ "$group" != "$HOST_USER" ]; then
  groupmod -n "$HOST_USER" "$group"
fi
user="$(getent passwd "$HOST_UID" | cut -d: -f1 || true)"
if [ -z "$user" ]; then
  useradd -u "$HOST_UID" -g "$HOST_GID" -d "$HOST_HOME" -M -s /bin/bash "$HOST_USER"
elif [ "$user" != "$HOST_USER" ] || [ "$(getent passwd "$HOST_UID" | cut -d: -f6)" != "$HOST_HOME" ]; then
  usermod -l "$HOST_USER" -d "$HOST_HOME" "$user"
fi

if [ -n "${HELMSHELL_TMUX_SOCKET:-}" ] && [ ! -S "$HELMSHELL_TMUX_SOCKET" ]; then
  echo "[helmshell] Warning: $HELMSHELL_TMUX_SOCKET not found."
  echo "[helmshell] On the host: systemctl --user enable --now helmshell-tmux (deploy/prepare-host.sh)"
fi

cd "$APP_DIR"
echo "[helmshell] Starting as $HOST_USER ($HOST_UID:$HOST_GID) from $APP_DIR"
exec setpriv --reuid="$HOST_UID" --regid="$HOST_GID" --init-groups \
  env HOME="$HOST_HOME" USER="$HOST_USER" LOGNAME="$HOST_USER" LANG=C.UTF-8 \
  PATH="$HOST_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  python3 -u server.py
