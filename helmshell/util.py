import json
import os
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

from . import config
from .i18n import _


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def run(args, cwd=None, timeout=30, input=None, env=None, strip=True):
    """Lance une commande sans shell. Renvoie (code, sortie combinée).

    strip=False garde les espaces de début (indispensables pour `git status --porcelain`)."""
    try:
        proc = subprocess.run(
            args, cwd=cwd, input=input, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=timeout, env=env,
        )
    except FileNotFoundError:
        return 127, _("Commande introuvable : {command}", command=args[0])
    except subprocess.TimeoutExpired:
        return 124, _("Délai dépassé ({seconds} s)", seconds=timeout)
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, (out.strip() if strip else out.rstrip())


# Secrets du serveur : jamais transmis aux terminaux, tâches et sessions Claude (une commande d'un dépôt
# ou un Claude détourné pourrait les lire et les envoyer ailleurs).
CHILD_ENV_DROP = {"HELMSHELL_PASSWORD", "COOLIFY_TOKEN", "DOKPLOY_TOKEN"}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # la 30x remonte comme une erreur : le jeton n'est pas renvoyé vers une autre adresse


_OPENER = urllib.request.build_opener(_NoRedirect)


def open_url(req, timeout):
    """urlopen sans suivre les redirections (les en-têtes d'authentification ne partent pas ailleurs)."""
    return _OPENER.open(req, timeout=timeout)


def tmux_slug(slug):
    """Nom de projet → morceau de nom de session tmux, sans collision possible.

    tmux interdit « . » et « : » ; « a.b » et « a_b » donnaient la même session. Ici « _ » devient « __ »
    et « . » devient « _d » : les noms faits de lettres, chiffres et tirets ne changent pas.
    """
    return slug.replace("_", "__").replace(".", "_d")


def child_env():
    env = {k: v for k, v in os.environ.items() if k not in CHILD_ENV_DROP}
    extra = [str(config.HOME / ".local" / "bin"), str(Path(config.get("claude_bin")).parent),
             str(Path(config.get("codex_bin")).parent)]
    parts = env.get("PATH", "/usr/local/bin:/usr/bin:/bin").split(":")
    env["PATH"] = ":".join(dict.fromkeys(extra + parts))
    env.setdefault("LANG", "C.UTF-8")
    return env


# --- tmux ---------------------------------------------------------------------
# En conteneur (Coolify), HELMSHELL_TMUX_SOCKET pointe vers le socket d'un serveur tmux
# lancé sur l'hôte : les sessions Claude et les shells tournent alors sur l'hôte.

def tmux_socket():
    return os.environ.get("HELMSHELL_TMUX_SOCKET", "")


def tmux_cmd(*args):
    sock = tmux_socket()
    if sock:
        if not os.path.exists(sock):
            raise ApiError(_("Le serveur tmux de l'hôte n'est pas lancé "
                             "(sur le serveur : systemctl --user start helmshell-tmux)"), 503)
        return ["tmux", "-S", sock, *args]
    return ["tmux", *args]


_styled = {"done": False}


def tmux_style():
    """Barre d'état de tmux discrète, aux couleurs du terminal de Helmshell (serveur tmux de Helmshell seulement)."""
    if _styled["done"] or not tmux_socket():
        return
    for opt, val in (("status-style", "bg=#18211F,fg=#8FA29C"), ("status-left", " #S "), ("status-left-length", "40"),
                     ("status-left-style", "fg=#9EF2E4,bold"), ("status-right", " %H:%M "),
                     ("window-status-current-style", "fg=#DDE4E1")):
        run(tmux_cmd("set-option", "-g", opt, val), timeout=5)
    _styled["done"] = True


# --- Journal d'activité -----------------------------------------------------

_act_lock = threading.Lock()


def log_activity(text, kind="info", project=None):
    entry = {"t": time.time(), "text": text, "kind": kind, "project": project}
    with _act_lock:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        path = config.DATA_DIR / "activite.jsonl"
        with open(path, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        # garde le fichier raisonnable
        if path.stat().st_size > 512_000:
            lines = path.read_text().splitlines()[-500:]
            path.write_text("\n".join(lines) + "\n")


def log_login(text):
    """Journal des connexions, séparé de l'activité : un flot de requêtes ne peut pas en effacer l'historique."""
    entry = {"t": time.time(), "text": text}
    with _act_lock:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        path = config.DATA_DIR / "connexions.jsonl"
        with open(path, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        if path.stat().st_size > 2_000_000:
            lines = path.read_text().splitlines()[-10_000:]
            path.write_text("\n".join(lines) + "\n")


def last_activity_map():
    """Dernière activité connue par projet (horodatage)."""
    path = config.DATA_DIR / "activite.jsonl"
    out = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("project"):
            out[e["project"]] = max(out.get(e["project"], 0), e.get("t", 0))
    return out


def recent_activity(limit=20, project=None):
    path = config.DATA_DIR / "activite.jsonl"
    if not path.exists():
        return []
    out = []
    for line in reversed(path.read_text().splitlines()):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if project and e.get("project") != project:
            continue
        out.append(e)
        if len(out) >= limit:
            break
    return out
