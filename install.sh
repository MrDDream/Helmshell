#!/usr/bin/env bash
# Helmshell installer: interactive, bilingual (English / Français), safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/MrDDream/Helmshell/main/install.sh | bash
#   # or, from a clone:
#   git clone https://github.com/MrDDream/Helmshell.git ~/helmshell && ~/helmshell/install.sh
#
# Nothing is installed with sudo without an explicit "y". Run with --help for the options and
# --dry-run to see every action without changing anything.
set -euo pipefail

REPO_URL="https://github.com/MrDDream/Helmshell.git"
CLAUDE_INSTALL="curl -fsSL https://claude.ai/install.sh | bash"
CODEX_INSTALL_NPM="npm install -g @openai/codex"
CODEX_INSTALL_SH="curl -fsSL https://chatgpt.com/codex/install.sh | sh"

# --- Options -------------------------------------------------------------------------------------
YES=0
DRY_RUN=0
NO_AGENTS=0
OPT_LANG=""
OPT_MODE=""
OPT_DIR=""
OPT_PORT=""
OPT_NETWORKS=""
OPT_PROJECTS=""
ORIG_ARGS=("$@")
UI_LANG="en"
UPDATING=0
PASSWORD=""

usage() {
  cat <<'EOF'
Helmshell installer

Usage: install.sh [options]
   or: curl -fsSL https://raw.githubusercontent.com/MrDDream/Helmshell/main/install.sh | bash -s -- [options]

  --yes                 Accept the default answers (non-interactive). Never installs packages or
                        agents and never runs sudo: those defaults are "no".
  --lang en|fr          Language of the installer and initial language of Helmshell.
  --mode systemd|docker Installation mode (default: systemd).
  --dir PATH            Where to clone Helmshell when the installer is piped (default: ~/helmshell).
  --projects PATH       Projects folder (default: ~/projects, or ~/projets in French, or the one that exists).
  --port N              Port of the web interface (default: 8787).
  --networks CIDRs      Comma-separated networks allowed to connect (default: detected LAN + VPN).
  --no-agents-install   Do not offer to install Claude Code or Codex.
  --dry-run             Print the actions without changing anything.
  --help                Show this help.
EOF
}

die() { printf '\n%s\n' "$*" >&2; exit 1; }

parse_args() {
  while [ $# -gt 0 ]; do
    local arg=$1 val=""
    case $arg in
      --*=*) val=${arg#*=}; arg=${arg%%=*} ;;
    esac
    case $arg in
      --lang|--mode|--dir|--port|--networks|--projects)
        if [ -z "$val" ]; then
          [ $# -ge 2 ] || die "Missing value for $arg"
          val=$2; shift
        fi ;;
    esac
    case $arg in
      -y|--yes) YES=1 ;;
      --dry-run) DRY_RUN=1 ;;
      --no-agents-install) NO_AGENTS=1 ;;
      --lang) OPT_LANG=$val ;;
      --mode) OPT_MODE=$val ;;
      --dir) OPT_DIR=$val ;;
      --port) OPT_PORT=$val ;;
      --networks) OPT_NETWORKS=$val ;;
      --projects) OPT_PROJECTS=$val ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; die "Unknown option: $1" ;;
    esac
    shift
  done
  case $OPT_LANG in ""|en|fr) ;; *) die "--lang must be en or fr" ;; esac
  case $OPT_MODE in ""|systemd|docker) ;; *) die "--mode must be systemd or docker" ;; esac
  return 0
}

# --- Output and questions ------------------------------------------------------------------------
if [ -t 1 ]; then
  B=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GRN=$'\033[32m' YEL=$'\033[33m' CYA=$'\033[36m' R=$'\033[0m'
else
  B="" DIM="" RED="" GRN="" YEL="" CYA="" R=""
fi

L() { if [ "$UI_LANG" = fr ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }
say() { printf '%s\n' "$(L "$1" "$2")"; }
ok() { printf '%s\n' "${GRN}✓${R} $(L "$1" "$2")"; }
warn() { printf '%s\n' "${YEL}!${R} $(L "$1" "$2")"; }
step() { printf '\n%s\n' "${B}${CYA}[$1/8]${R} ${B}$(L "$2" "$3")${R}"; }

TTY=""
setup_tty() {
  if [ -t 0 ]; then
    TTY=/dev/stdin
  elif { : </dev/tty; } 2>/dev/null; then
    TTY=/dev/tty
  elif [ "$YES" != 1 ]; then
    die "No terminal to ask questions: run it from a terminal, or add --yes (bash -s -- --yes)."
  fi
}

# ask VAR "question" "default"
ask() {
  local __var=$1 __q=$2 __def=${3-} __ans=""
  if [ "$YES" = 1 ]; then
    printf '%s %s\n' "$__q" "${DIM}[${__def}]${R} → ${__def}"
    __ans=$__def
  else
    read -r -p "$__q [${__def}]: " __ans <"$TTY" || true
    [ -n "$__ans" ] || __ans=$__def
  fi
  printf -v "$__var" '%s' "$__ans"
}

# ask_yn "question" y|n  → status 0 for yes. With --yes, the default is taken.
ask_yn() {
  local q=$1 def=$2 hint ans=""
  if [ "$def" = y ]; then hint="$(L "[Y/n]" "[O/n]")"; else hint="$(L "[y/N]" "[o/N]")"; fi
  if [ "$YES" = 1 ]; then
    printf '%s %s → %s\n' "$q" "$hint" "$def"
    ans=$def
  else
    read -r -p "$q $hint " ans <"$TTY" || true
    [ -n "$ans" ] || ans=$def
  fi
  case $ans in y|Y|yes|Yes|YES|o|O|oui|Oui|OUI) return 0 ;; *) return 1 ;; esac
}

# --- Actions (printed, and skipped with --dry-run) -----------------------------------------------
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '%s\n' "${DIM}[dry-run]${R} $*"
  else
    printf '%s\n' "${DIM}→ $*${R}"
    "$@"
  fi
}

# run_sh "pipeline" : for the official one-line installers (curl … | bash)
run_sh() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '%s\n' "${DIM}[dry-run]${R} $1"
  else
    printf '%s\n' "${DIM}→ $1${R}"
    bash -c "$1"
  fi
}

# write_file PATH MODE CONTENT  (written with umask 077, then chmod MODE)
write_file() {
  local path=$1 mode=$2 content=$3
  if [ "$DRY_RUN" = 1 ]; then
    printf '%s\n' "${DIM}[dry-run]${R} write $path (chmod $mode):"
    printf '%s\n' "$content" | sed -e 's/^\(HELMSHELL_PASSWORD=\).*/\1********/' -e 's/^/    /'
  else
    printf '%s\n' "${DIM}→ write $path${R}"
    (umask 077 && printf '%s\n' "$content" >"$path")
    chmod "$mode" "$path"
  fi
}

expand_path() {
  local p=$1
  case $p in
    "~") p=$HOME ;;
    "~/"*) p="$HOME/${p#\~/}" ;;
  esac
  case $p in
    /*) ;;
    *) p="$PWD/$p" ;;
  esac
  printf '%s' "${p%/}"
}

# --- System helpers ------------------------------------------------------------------------------
USER=${USER:-$(id -un)}
SUDO=""
[ "$(id -u)" = 0 ] || SUDO="sudo"
PM=""
detect_pm() {
  if command -v apt-get >/dev/null 2>&1; then PM=apt
  elif command -v dnf >/dev/null 2>&1; then PM=dnf
  else PM=""
  fi
}

pkg_install_cmd() {
  case $PM in
    apt) printf '%s' "${SUDO:+$SUDO }apt-get update && ${SUDO:+$SUDO }apt-get install -y $*" ;;
    dnf) printf '%s' "${SUDO:+$SUDO }dnf install -y $*" ;;
  esac
}

pkg_install() {
  case $PM in
    apt) run $SUDO apt-get update && run $SUDO apt-get install -y "$@" ;;
    dnf) run $SUDO dnf install -y "$@" ;;
    *) return 1 ;;
  esac
}

python_ok() {
  command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null
}

has_claude() { command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ]; }
has_codex() { command -v codex >/dev/null 2>&1 || [ -x "$HOME/.local/bin/codex" ]; }
docker_ok() {
  if [ "$DRY_RUN" = 1 ]; then command -v docker >/dev/null 2>&1; else docker compose version >/dev/null 2>&1; fi
}

ip2int() {
  local a b c d
  IFS=. read -r a b c d <<<"$1"
  printf '%s' $(( (a << 24) + (b << 16) + (c << 8) + d ))
}
int2ip() { printf '%s' "$(( ($1 >> 24) & 255 )).$(( ($1 >> 16) & 255 )).$(( ($1 >> 8) & 255 )).$(( $1 & 255 ))"; }
# network_of 192.168.1.42/24 → 192.168.1.0/24 (optional 2nd argument: other prefix length)
network_of() {
  local ip=${1%/*} p=${2:-${1#*/}} n mask
  n=$(ip2int "$ip")
  mask=$(( p == 0 ? 0 : (0xFFFFFFFF << (32 - p)) & 0xFFFFFFFF ))
  printf '%s/%s' "$(int2ip $(( n & mask )))" "$p"
}
is_cgnat() { local n; n=$(ip2int "${1%/*}"); [ $(( n & 0xFFC00000 )) -eq $(( (100 << 24) | (64 << 16) )) ]; }

DEFAULT_IFACE=""
LAN_IP=""
detect_lan() {
  command -v ip >/dev/null 2>&1 || return 0
  DEFAULT_IFACE=$(ip -4 route show default 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit }}')
  [ -n "$DEFAULT_IFACE" ] || return 0
  LAN_IP=$(ip -o -4 addr show dev "$DEFAULT_IFACE" scope global 2>/dev/null | awk '{print $4; exit}')
}

detect_networks() {
  local nets=() cidr iface addr
  if [ -n "$DEFAULT_IFACE" ]; then
    cidr=$(ip -4 route show dev "$DEFAULT_IFACE" scope link proto kernel 2>/dev/null | awk '$1 ~ /\// {print $1; exit}')
    if [ -z "$cidr" ] && [ -n "$LAN_IP" ]; then cidr=$(network_of "$LAN_IP"); fi
    [ -n "$cidr" ] && nets+=("$cidr")
  fi
  if command -v ip >/dev/null 2>&1; then
    while read -r iface addr; do
      case $iface in
        tailscale*|wt*|wg*|nb*|netbird*)
          if is_cgnat "$addr"; then nets+=("100.64.0.0/10"); else nets+=("$(network_of "$addr" 16)"); fi ;;
      esac
    done < <(ip -o -4 addr show 2>/dev/null | awk '{print $2, $4}')
  fi
  [ ${#nets[@]} -gt 0 ] || nets=("192.168.0.0/16" "100.64.0.0/10")
  # unique, in order
  printf '%s\n' "${nets[@]}" | awk '!seen[$0]++' | paste -sd, -
}

initial_password_file() {
  local f
  for f in initial-password.txt mot-de-passe-initial.txt; do
    [ -f "$HOME/.config/helmshell/$f" ] && { printf '%s' "$HOME/.config/helmshell/$f"; return 0; }
  done
  return 1
}

linger_enabled() { loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q yes; }

offer_linger() {
  linger_enabled && return 0
  say "Without \"lingering\", your user services stop when you log out and do not start at boot." \
      "Sans « linger », tes services utilisateur s'arrêtent à la déconnexion et ne démarrent pas au boot."
  if ask_yn "$(L "Enable it now (sudo loginctl enable-linger $USER)?" "L'activer maintenant (sudo loginctl enable-linger $USER) ?")" n; then
    run $SUDO loginctl enable-linger "$USER" || warn "Failed: run it yourself later." "Échec : lance-la toi-même plus tard."
  else
    say "Later: sudo loginctl enable-linger $USER" "Plus tard : sudo loginctl enable-linger $USER"
  fi
}

# --- Bootstrap (installer piped from curl) -------------------------------------------------------
APP_DIR=""
find_checkout() {
  local src=${BASH_SOURCE[0]:-} dir
  [ -n "$src" ] && [ -f "$src" ] || return 1
  dir=$(cd "$(dirname "$src")" && pwd)
  [ -f "$dir/server.py" ] && [ -f "$dir/helmshell/__init__.py" ] || return 1
  APP_DIR=$dir
}

ask_language() {
  if [ -n "$OPT_LANG" ]; then UI_LANG=$OPT_LANG; return 0; fi
  local ans
  ask ans "Language / Langue (en, fr)" en
  case $ans in fr|FR|fr_*|français|francais|Français) UI_LANG=fr ;; *) UI_LANG=en ;; esac
}

bootstrap() {
  local dest ans
  printf '\n%s\n' "${B}Helmshell${R}"
  step 1 "Language" "Langue"
  ask_language
  say "Helmshell is not downloaded yet: the installer will clone it with git." \
      "Helmshell n'est pas encore téléchargé : l'installateur va le cloner avec git."
  ask dest "$(L "Where should Helmshell be installed?" "Où installer Helmshell ?")" "${OPT_DIR:-$HOME/helmshell}"
  dest=$(expand_path "$dest")
  if [ -f "$dest/install.sh" ] && [ -f "$dest/server.py" ]; then
    ok "Existing copy found in $dest." "Copie existante trouvée dans $dest."
  elif [ -e "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
    die "$(L "$dest exists and is not empty: choose another folder (--dir)." "$dest existe et n'est pas vide : choisis un autre dossier (--dir).")"
  else
    if ! command -v git >/dev/null 2>&1; then
      detect_pm
      [ -n "$PM" ] || die "$(L "git is required." "git est requis.")"
      if ask_yn "$(L "git is missing. Install it ($(pkg_install_cmd git))?" "git manque. L'installer ($(pkg_install_cmd git)) ?")" n; then
        pkg_install git
      else
        die "$(L "git is required: $(pkg_install_cmd git)" "git est requis : $(pkg_install_cmd git)")"
      fi
    fi
    run git clone "$REPO_URL" "$dest"
  fi
  if [ ! -f "$dest/install.sh" ]; then
    say "[dry-run] The installer would now continue with $dest/install.sh." \
        "[dry-run] L'installateur continuerait maintenant avec $dest/install.sh."
    exit 0
  fi
  exec bash "$dest/install.sh" ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"} --lang "$UI_LANG" --dir "$dest"
}

# --- Existing installation: update ---------------------------------------------------------------
SERVICE_FILE="$HOME/.config/systemd/user/helmshell.service"
ENV_FILE="$HOME/.config/helmshell/helmshell.env"

render_service() {
  local content py
  content=$(<"$APP_DIR/deploy/helmshell.service")
  py=$(command -v python3 || echo /usr/bin/python3)
  shopt -u patsub_replacement 2>/dev/null || true
  content=${content//"%h/helmshell"/"$APP_DIR"}
  content=${content//"/usr/bin/python3"/"$py"}
  run mkdir -p "$HOME/.config/systemd/user"
  write_file "$SERVICE_FILE" 644 "$content"
}

update_existing() {
  local mode=$1
  if [ -e "$APP_DIR/.git" ]; then
    run git -C "$APP_DIR" pull --ff-only || die "$(L "git pull failed (local changes?). Fix it, then re-run the installer." "git pull a échoué (modifications locales ?). Corrige, puis relance l'installateur.")"
  else
    warn "$APP_DIR is not a git clone: code not updated." "$APP_DIR n'est pas un clone git : code non mis à jour."
  fi
  if [ "$mode" = docker ]; then
    run docker compose -f "$APP_DIR/deploy/docker-compose.yml" --env-file "$APP_DIR/deploy/.env" pull
    run docker compose -f "$APP_DIR/deploy/docker-compose.yml" --env-file "$APP_DIR/deploy/.env" up -d
  else
    render_service
    run systemctl --user daemon-reload
    run systemctl --user restart helmshell
  fi
  ok "Helmshell updated, settings kept." "Helmshell mis à jour, réglages conservés."
  UPDATING=1
  final_message "$(existing_port "$mode")" "$mode"
  exit 0
}

existing_port() {
  local f p=""
  if [ "$1" = docker ]; then f="$APP_DIR/deploy/.env"; else f=$ENV_FILE; fi
  [ -f "$f" ] && p=$(sed -n -E 's/^HELMSHELL_PORT=//p' "$f" | tail -n1)
  printf '%s' "${p:-8787}"
}

check_existing() {
  local mode=""
  if [ -f "$SERVICE_FILE" ] || [ -f "$ENV_FILE" ]; then mode=systemd
  elif [ -f "$APP_DIR/deploy/.env" ]; then mode=docker
  fi
  [ -n "$mode" ] || return 0
  printf '\n'
  ok "Existing Helmshell installation found ($mode)." "Installation existante de Helmshell trouvée ($mode)."
  if ask_yn "$(L "Update it (git pull + restart, settings kept)?" "La mettre à jour (git pull + redémarrage, réglages conservés) ?")" y; then
    update_existing "$mode"
  fi
  say "Continuing with a full reconfiguration (current files are backed up as *.bak)." \
      "On continue avec une reconfiguration complète (les fichiers actuels sont sauvegardés en *.bak)."
}

backup() {
  [ -f "$1" ] || return 0
  run cp -p "$1" "$1.bak"
}

# --- Steps ---------------------------------------------------------------------------------------
check_prereqs() {
  step 2 "Prerequisites" "Prérequis"
  detect_pm
  local missing=() tool
  if python_ok; then ok "python3 $(python3 -c 'import platform; print(platform.python_version())')" "python3 $(python3 -c 'import platform; print(platform.python_version())')"
  elif command -v python3 >/dev/null 2>&1; then
    die "$(L "Python 3.10 or newer is required (found $(python3 -V 2>&1)). Upgrade your distribution's Python first." \
             "Python 3.10 ou plus est requis (trouvé : $(python3 -V 2>&1)). Mets d'abord à jour le Python de ta distribution.")"
  else missing+=(python3)
  fi
  for tool in tmux git; do
    if command -v "$tool" >/dev/null 2>&1; then ok "$tool" "$tool"; else missing+=("$tool"); fi
  done
  [ ${#missing[@]} -eq 0 ] && return 0
  warn "Missing: ${missing[*]}" "Manquant : ${missing[*]}"
  if [ -z "$PM" ]; then
    die "$(L "Install them with your package manager, then re-run the installer." "Installe-les avec ton gestionnaire de paquets, puis relance l'installateur.")"
  fi
  if ask_yn "$(L "Install them now ($(pkg_install_cmd "${missing[*]}"))?" "Les installer maintenant ($(pkg_install_cmd "${missing[*]}")) ?")" n; then
    pkg_install "${missing[@]}"
  elif [ "$DRY_RUN" = 1 ]; then
    warn "[dry-run] Continuing although ${missing[*]} is missing." "[dry-run] On continue malgré l'absence de ${missing[*]}."
    return 0
  else
    die "$(L "Required: $(pkg_install_cmd "${missing[*]}")" "Requis : $(pkg_install_cmd "${missing[*]}")")"
  fi
  if [ "$DRY_RUN" != 1 ]; then
    python_ok && command -v tmux >/dev/null && command -v git >/dev/null \
      || die "$(L "Prerequisites still missing." "Prérequis toujours manquants.")"
  fi
}

codex_install_cmd() {
  local major prefix
  if [ "$OPT_MODE" != docker ] && command -v npm >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
    prefix=$(npm prefix -g 2>/dev/null || echo /nonexistent)
    # npm only when Node is recent enough and the global prefix is writable without sudo
    if [ "${major:-0}" -ge 18 ] 2>/dev/null && { [ -w "$prefix/lib/node_modules" ] || [ -w "$prefix/lib" ]; }; then
      printf '%s' "$CODEX_INSTALL_NPM"; return 0
    fi
  fi
  printf '%s' "$CODEX_INSTALL_SH"
}

check_agents() {
  step 3 "AI agents" "Agents IA"
  local cmd
  if has_claude; then ok "Claude Code" "Claude Code"
  else
    warn "Claude Code (claude) not found." "Claude Code (claude) introuvable."
    if [ "$NO_AGENTS" != 1 ] && ask_yn "$(L "Install Claude Code ($CLAUDE_INSTALL)?" "Installer Claude Code ($CLAUDE_INSTALL) ?")" n; then
      run_sh "$CLAUDE_INSTALL" || warn "Claude Code installation failed." "L'installation de Claude Code a échoué."
    fi
  fi
  if has_codex; then ok "OpenAI Codex" "OpenAI Codex"
  else
    warn "OpenAI Codex (codex) not found." "OpenAI Codex (codex) introuvable."
    cmd=$(codex_install_cmd)
    if [ "$NO_AGENTS" != 1 ] && ask_yn "$(L "Install Codex ($cmd)?" "Installer Codex ($cmd) ?")" n; then
      run_sh "$cmd" || warn "Codex installation failed." "L'installation de Codex a échoué."
    fi
  fi
  if ! has_claude && ! has_codex && [ "$DRY_RUN" != 1 ]; then
    warn "No AI agent installed: Helmshell will work (files, Git, terminals) but cannot start agent sessions." \
         "Aucun agent IA installé : Helmshell fonctionnera (fichiers, Git, terminaux) mais sans sessions d'agent."
    if [ "$YES" != 1 ] && ! ask_yn "$(L "Continue anyway?" "Continuer quand même ?")" n; then
      die "$(L "Install Claude Code or Codex, then re-run the installer." "Installe Claude Code ou Codex, puis relance l'installateur.")"
    fi
  fi
  say "Remember to log in once, as $USER, before using an agent in Helmshell:" \
      "Pense à te connecter une fois, en tant que $USER, avant d'utiliser un agent dans Helmshell :"
  printf '    %s\n' "Claude Code : claude   $(L "then" "puis") /login" "Codex       : codex login --device-auth"
}

choose_mode() {
  step 4 "Installation mode" "Mode d'installation"
  local ans
  if [ -n "$OPT_MODE" ]; then
    MODE=$OPT_MODE
  elif docker_ok; then
    say "  1) systemd: user service running directly on the server (recommended)" \
        "  1) systemd : service utilisateur, directement sur le serveur (recommandé)"
    say "  2) docker: container (ghcr.io/mrddream/helmshell) driving the host's tmux" \
        "  2) docker : conteneur (ghcr.io/mrddream/helmshell) qui pilote le tmux de l'hôte"
    ask ans "$(L "Mode" "Mode")" 1
    case $ans in 2|docker) MODE=docker ;; *) MODE=systemd ;; esac
  else
    MODE=systemd
    say "Docker Compose not available: systemd mode." "Docker Compose indisponible : mode systemd."
  fi
  if [ "$MODE" = docker ] && ! docker_ok; then
    die "$(L "docker compose does not work for $USER." "docker compose ne fonctionne pas pour $USER.")"
  fi
  if [ "$MODE" = systemd ] && ! command -v systemctl >/dev/null 2>&1; then
    die "$(L "systemd is required for this mode." "systemd est requis pour ce mode.")"
  fi
  ok "$MODE" "$MODE"
}

choose_projects() {
  step 5 "Projects folder" "Dossier des projets"
  local def
  if [ -n "$OPT_PROJECTS" ]; then def=$OPT_PROJECTS
  elif [ -d "$HOME/projets" ]; then def="$HOME/projets"
  elif [ -d "$HOME/projects" ]; then def="$HOME/projects"
  elif [ "$UI_LANG" = fr ]; then def="$HOME/projets"
  else def="$HOME/projects"
  fi
  say "Each sub-folder of this folder is a project." "Chaque sous-dossier de ce dossier est un projet."
  ask PROJECTS "$(L "Projects folder" "Dossier des projets")" "$def"
  PROJECTS=$(expand_path "$PROJECTS")
  if [ "$MODE" = docker ]; then
    case $PROJECTS/ in "$HOME"/*) ;; *) die "$(L "In docker mode the projects folder must be inside $HOME (the only folder mounted)." "En mode docker, le dossier des projets doit être dans $HOME (seul dossier monté).")" ;; esac
  fi
  [ -d "$PROJECTS" ] || run mkdir -p "$PROJECTS"
}

choose_port() {
  step 6 "Port" "Port"
  while :; do
    ask PORT "$(L "Port of the web interface" "Port de l'interface web")" "${OPT_PORT:-8787}"
    if [[ $PORT =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; then break; fi
    [ "$YES" = 1 ] && die "Invalid port: $PORT"
    warn "Invalid port." "Port invalide."
  done
  if command -v ss >/dev/null 2>&1 && [ -n "$(ss -ltnH "sport = :$PORT" 2>/dev/null)" ]; then
    warn "Port $PORT is already in use (fine if it is a previous Helmshell)." \
         "Le port $PORT est déjà utilisé (normal si c'est un Helmshell précédent)."
  fi
}

choose_networks() {
  step 7 "Allowed networks" "Réseaux autorisés"
  local def item ok_all
  def=${OPT_NETWORKS:-$(detect_networks)}
  say "Only these networks can reach Helmshell (others get a 403); refine later in Settings › Security." \
      "Seuls ces réseaux peuvent joindre Helmshell (les autres reçoivent une 403) ; à affiner ensuite dans Paramètres › Sécurité."
  [ -n "$LAN_IP" ] && say "Detected: $LAN_IP on $DEFAULT_IFACE." "Détecté : $LAN_IP sur $DEFAULT_IFACE."
  while :; do
    ask NETWORKS "$(L "Networks (comma-separated CIDRs)" "Réseaux (CIDR séparés par des virgules)")" "$def"
    NETWORKS=${NETWORKS// /}
    ok_all=1
    IFS=, read -r -a _items <<<"$NETWORKS"
    for item in "${_items[@]}"; do
      [[ $item =~ ^[0-9A-Fa-f:.]+(/[0-9]{1,3})?$ ]] || ok_all=0
    done
    [ -n "$NETWORKS" ] && [ "$ok_all" = 1 ] && break
    [ "$YES" = 1 ] && die "Invalid networks: $NETWORKS"
    warn "Invalid list, example: 192.168.1.0/24,100.64.0.0/10" "Liste invalide, exemple : 192.168.1.0/24,100.64.0.0/10"
  done
}

choose_password() {
  step 8 "Password" "Mot de passe"
  PASSWORD=""
  if [ "$MODE" = docker ]; then
    say "Helmshell generates a random initial password on first start; change it in Settings › Security." \
        "Helmshell génère un mot de passe initial aléatoire au premier lancement ; change-le dans Paramètres › Sécurité."
    return 0
  fi
  say "  1) Generated by Helmshell on first start (recommended: stored hashed, changeable in Settings)" \
      "  1) Généré par Helmshell au premier lancement (recommandé : stocké haché, modifiable dans Paramètres)"
  say "  2) Fixed password of your choice (stored in $ENV_FILE, chmod 600; cannot be changed from the interface)" \
      "  2) Mot de passe fixe de ton choix (stocké dans $ENV_FILE, chmod 600 ; non modifiable depuis l'interface)"
  local ans p2
  ask ans "$(L "Choice" "Choix")" 1
  [ "$ans" = 2 ] || return 0
  while :; do
    read -r -s -p "$(L "Password (12 characters or more): " "Mot de passe (12 caractères ou plus) : ")" PASSWORD <"$TTY" || true
    printf '\n'
    read -r -s -p "$(L "Again: " "Encore : ")" p2 <"$TTY" || true
    printf '\n'
    if [ "${#PASSWORD}" -lt 12 ]; then warn "Too short." "Trop court."
    elif [ "$PASSWORD" != "$p2" ]; then warn "The two entries differ." "Les deux saisies diffèrent."
    else break
    fi
  done
}

# --- Installation --------------------------------------------------------------------------------
env_quote() {
  local v=${1//\\/\\\\}
  v=${v//\"/\\\"}
  printf '"%s"' "$v"
}

install_systemd() {
  printf '\n%s\n' "${B}$(L "Installing (systemd)" "Installation (systemd)")${R}"
  if [ "$DRY_RUN" != 1 ] && ! systemctl --user show-environment >/dev/null 2>&1; then
    die "$(L "The systemd user manager is not reachable (log in over SSH as $USER, not with su)." \
             "Le gestionnaire systemd utilisateur est injoignable (connecte-toi en SSH en tant que $USER, pas avec su).")"
  fi
  run mkdir -p "$HOME/.config/helmshell"
  run chmod 700 "$HOME/.config/helmshell"
  backup "$ENV_FILE"
  local content
  content="# Helmshell settings, written by install.sh on $(date '+%Y-%m-%d %H:%M').
# All options: $APP_DIR/deploy/helmshell.env.example. Apply changes with: systemctl --user restart helmshell
HELMSHELL_HOST=0.0.0.0
HELMSHELL_PORT=$PORT
HELMSHELL_LANGUAGE=$UI_LANG
PROJECTS_ROOT=$PROJECTS
HELMSHELL_ALLOWED_NETWORKS=$NETWORKS"
  if [ -n "$PASSWORD" ]; then content+=$'\n'"HELMSHELL_PASSWORD=$(env_quote "$PASSWORD")"; fi
  write_file "$ENV_FILE" 600 "$content"
  backup "$SERVICE_FILE"
  render_service
  run systemctl --user daemon-reload
  run systemctl --user enable helmshell
  run systemctl --user restart helmshell
  offer_linger
}

install_docker() {
  printf '\n%s\n' "${B}$(L "Installing (docker)" "Installation (docker)")${R}"
  if [ "$DRY_RUN" != 1 ] && systemctl --user is-active --quiet helmshell 2>/dev/null; then
    warn "The systemd service \"helmshell\" is running and would conflict with the container." \
         "Le service systemd « helmshell » tourne et entrerait en conflit avec le conteneur."
    if ask_yn "$(L "Stop and disable it?" "L'arrêter et le désactiver ?")" y; then
      run systemctl --user disable --now helmshell
    fi
  fi
  run bash "$APP_DIR/deploy/prepare-host.sh"
  local envf="$APP_DIR/deploy/.env" content
  backup "$envf"
  content="# Helmshell container settings, written by install.sh on $(date '+%Y-%m-%d %H:%M').
# All options: deploy/.env.example
HELMSHELL_HOME=$HOME
HOST_USER=$USER
HOST_UID=$(id -u)
HOST_GID=$(id -g)
HELMSHELL_PORT=$PORT
HELMSHELL_LANG=$UI_LANG
HELMSHELL_ALLOWED_NETWORKS=$NETWORKS
HELMSHELL_PROJECTS_ROOT=$PROJECTS"
  write_file "$envf" 600 "$content"
  run docker compose -f "$APP_DIR/deploy/docker-compose.yml" --env-file "$envf" pull
  run docker compose -f "$APP_DIR/deploy/docker-compose.yml" --env-file "$envf" up -d
  offer_linger
}

final_message() {
  local port=$1 mode=$2 host pwfile="" i
  host=${LAN_IP%/*}
  [ -n "$host" ] || host=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -n "$host" ] || host="<server-ip>"
  if [ "$DRY_RUN" != 1 ]; then
    say "Waiting for Helmshell to start…" "Attente du démarrage de Helmshell…"
    for i in $(seq 1 60); do
      pwfile=$(initial_password_file || true)
      [ -n "$pwfile" ] && break
      if command -v python3 >/dev/null 2>&1 && python3 -c "import socket,sys; socket.create_connection(('127.0.0.1', $port), 1)" 2>/dev/null; then break; fi
      sleep 1
    done
    pwfile=$(initial_password_file || true)
  fi
  printf '\n%s\n' "${B}${GRN}Helmshell: http://$host:$port${R}"
  if [ -n "$pwfile" ]; then
    say "Initial password: $(<"$pwfile")  (file: $pwfile)" "Mot de passe initial : $(<"$pwfile")  (fichier : $pwfile)"
    say "Change it in Settings › Security: the file is then deleted." "Change-le dans Paramètres › Sécurité : le fichier est alors supprimé."
  elif [ "$UPDATING" = 1 ]; then
    say "Password: unchanged." "Mot de passe : inchangé."
  elif [ -n "${PASSWORD:-}" ]; then
    say "Password: the one you typed (stored in $ENV_FILE)." "Mot de passe : celui que tu as saisi (stocké dans $ENV_FILE)."
  else
    say "Initial password: in ~/.config/helmshell/ (initial password file) once Helmshell has started." \
        "Mot de passe initial : dans ~/.config/helmshell/ (fichier du mot de passe initial) une fois Helmshell démarré."
  fi
  if [ "$mode" = docker ]; then
    say "Logs: docker compose -f $APP_DIR/deploy/docker-compose.yml --env-file $APP_DIR/deploy/.env logs -f" \
        "Journaux : docker compose -f $APP_DIR/deploy/docker-compose.yml --env-file $APP_DIR/deploy/.env logs -f"
  else
    say "Status: systemctl --user status helmshell · Logs: journalctl --user -u helmshell -f" \
        "État : systemctl --user status helmshell · Journaux : journalctl --user -u helmshell -f"
  fi
  say "Keep Helmshell on your LAN or VPN: it gives a shell on this server." \
      "Garde Helmshell sur ton réseau local ou ton VPN : il donne un shell sur ce serveur."
}

# --- Main ----------------------------------------------------------------------------------------
main() {
  parse_args "$@"
  setup_tty
  [ "$DRY_RUN" = 1 ] && printf '%s\n' "${YEL}Dry run: nothing will be changed.${R}"
  if ! find_checkout; then
    bootstrap
  fi
  case $APP_DIR in
    *[[:space:]%]*) die "The Helmshell folder path must not contain spaces or %: $APP_DIR" ;;
  esac
  if [ "$(id -u)" = 0 ]; then
    UI_LANG=${OPT_LANG:-en}
    warn "You are root: Helmshell should run as your normal user (it uses its home, SSH keys and agents)." \
         "Tu es root : Helmshell doit tourner sous ton utilisateur normal (son dossier, ses clés SSH, ses agents)."
    ask_yn "$(L "Continue as root?" "Continuer en root ?")" n || exit 1
  fi
  printf '\n%s\n' "${B}Helmshell $(cat "$APP_DIR/VERSION" 2>/dev/null || true)${R} ${DIM}($APP_DIR)${R}"
  step 1 "Language" "Langue"
  ask_language
  ok "$UI_LANG" "$UI_LANG"
  detect_lan
  check_existing
  check_prereqs
  check_agents
  choose_mode
  choose_projects
  choose_port
  choose_networks
  choose_password
  if [ "$MODE" = docker ]; then install_docker; else install_systemd; fi
  final_message "$PORT" "$MODE"
}

main "$@"
