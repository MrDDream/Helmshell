#!/usr/bin/env bash
# Prépare l'hôte pour Helmshell en conteneur (Docker Compose, Coolify, Dokploy) :
# installe et démarre le serveur tmux partagé avec le conteneur (service utilisateur helmshell-tmux).
# Les sessions Claude et les terminaux tournent ainsi sur l'hôte et survivent aux redémarrages du conteneur.
set -euo pipefail
cd "$(dirname "$0")"

command -v tmux >/dev/null || { echo "tmux est requis : sudo apt install tmux"; exit 1; }

mkdir -p ~/.config/systemd/user ~/.config/helmshell
chmod 700 ~/.config/helmshell
cp helmshell-tmux.service ~/.config/systemd/user/helmshell-tmux.service
systemctl --user daemon-reload
systemctl --user enable --now helmshell-tmux
sleep 1

sock="$HOME/.config/helmshell/tmux.sock"
if [ -S "$sock" ]; then
  echo "OK : serveur tmux de l'hôte prêt ($sock)"
else
  echo "Échec : $sock introuvable. Voir : journalctl --user -u helmshell-tmux"
  exit 1
fi

if systemctl --user is-active --quiet helmshell 2>/dev/null; then
  echo "Le service systemd « helmshell » tourne déjà sur le port 8787 : arrête-le avant de lancer le conteneur :"
  echo "  systemctl --user disable --now helmshell"
fi

if ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q yes; then
  echo
  echo "Important : pour que le serveur tmux démarre au boot sans session ouverte :"
  echo "  sudo loginctl enable-linger $USER"
fi
echo
echo "Tes valeurs pour deploy/.env : HELMSHELL_HOME=$HOME HOST_USER=$USER HOST_UID=$(id -u) HOST_GID=$(id -g)"
