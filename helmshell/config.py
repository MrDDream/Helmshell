"""Configuration persistante de Helmshell (~/.config/helmshell/config.json)."""
import hashlib
import hmac
import json
import os
import secrets
import shutil
import threading
from pathlib import Path

HOME = Path.home()
DATA_DIR = Path(os.environ.get("HELMSHELL_DATA") or HOME / ".config" / "helmshell")
CONFIG_FILE = DATA_DIR / "config.json"
_lock = threading.RLock()
_cache = None
_file_existed = None  # le fichier de configuration existait-il au premier chargement (installation existante) ?
LANGUAGES = ("en", "fr")


def _default_root():
    env = os.environ.get("PROJECTS_ROOT")
    if env:
        return env
    srv = Path("/srv/projets")
    if srv.is_dir() and os.access(srv, os.W_OK):
        return str(srv)
    return str(HOME / "projets")


def _default_claude():
    return (os.environ.get("CLAUDE_BIN")
            or shutil.which("claude")
            or str(HOME / ".local" / "bin" / "claude"))


def _default_codex():
    env = os.environ.get("CODEX_BIN")
    if env:
        return env
    found = shutil.which("codex")
    if found:
        return found
    for cand in (HOME / ".local" / "bin" / "codex", HOME / ".npm-global" / "bin" / "codex"):
        if cand.is_file():
            return str(cand)
    return str(HOME / ".local" / "bin" / "codex")


DEFAULTS = {
    "projects_root": "",
    "coolify_url": os.environ.get("COOLIFY_URL", "http://localhost:8000"),
    "coolify_public_url": "",
    "coolify_token": os.environ.get("COOLIFY_TOKEN", ""),
    "coolify_project_uuid": "",
    "coolify_server_uuid": "",
    "coolify_environment": "production",
    "deploy_provider": None,  # "" | "coolify" | "dokploy" (None = Coolify s'il a un jeton, réglage d'avant)
    "dokploy_url": os.environ.get("DOKPLOY_URL", ""),
    "dokploy_public_url": "",
    "dokploy_token": os.environ.get("DOKPLOY_TOKEN", ""),
    "dokploy_project_id": "",
    "dokploy_environment_id": "",
    "dokploy_server_id": "",
    "domain_suffix": "",
    "default_mode": "acceptEdits",
    "claude_bin": "",
    "default_agent": "",   # "" = Claude Code s'il est installé, sinon le premier agent disponible (voir agents.py)
    "codex_bin": "",
    "codex_default_mode": "auto",
    "language": None,      # "en" | "fr" ; None = pas encore choisie (fixée par ensure_initialized)
    "update_check": True,
    "notify_service": "",
    "usage_every": 5,      # minutes entre deux lectures de /usage en tâche de fond (0 = seulement quand l'Accueil est ouvert)
    "notify_done": True,   # prévenir quand Claude a fini de travailler  # ntfy | gotify | discord | off ("" = ntfy si une adresse est réglée)
    "ntfy_url": "",
    "ntfy_token": "",
    "gotify_url": "",
    "gotify_token": "",
    "discord_webhook": "",
    "public_url": os.environ.get("HELMSHELL_PUBLIC_URL", ""),
    "password_hash": "",
    "forges": [],          # comptes Git liés (voir forges.py)
    "totp_secret": "",     # double authentification active si renseigné
    "totp_pending": "",    # secret en cours d'activation
    "totp_last": 0,        # dernier pas de temps accepté (anti-rejeu)
    "totp_recovery": [],   # codes de secours hachés
    "oidc_issuer": "",     # connexion OIDC (voir oidc.py)
    "oidc_client_id": "",
    "oidc_client_secret": "",
    "oidc_allowed_emails": "",
    "oidc_group": "",
    "oidc_label": "",
    "oidc_tested": False,
    "oidc_enabled": False, # True = mot de passe refusé (secours : HELMSHELL_OIDC_DISABLE=1)
    "access": {},          # accès réseau (voir access.py) ; vide = HELMSHELL_ALLOWED_NETWORKS
    "secret": "",
    "session_epoch": 0,    # changé pour déconnecter tous les appareils
    "projects": {},
}


def load():
    global _cache, _file_existed
    with _lock:
        if _cache is None:
            data = {}
            if _file_existed is None:
                _file_existed = CONFIG_FILE.exists()
            if CONFIG_FILE.exists():
                try:
                    data = json.loads(CONFIG_FILE.read_text())
                except ValueError:
                    data = {}
            merged = json.loads(json.dumps(DEFAULTS))
            merged.update(data)
            _cache = merged
        return _cache


def save():
    with _lock:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(DATA_DIR, 0o700)
        tmp = CONFIG_FILE.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(_cache, f, indent=2, ensure_ascii=False)
        os.replace(tmp, CONFIG_FILE)


def get(key):
    value = load().get(key)
    if key == "projects_root":
        return value or _default_root()
    if key == "claude_bin":
        return value or _default_claude()
    if key == "codex_bin":
        return value or _default_codex()
    if key == "coolify_token":
        return value or os.environ.get("COOLIFY_TOKEN", "")
    return value


def update(**values):
    with _lock:
        load().update(values)
        save()


def project_meta(slug):
    return dict(load()["projects"].get(slug, {}))


def remove_project_meta(slug):
    with _lock:
        meta = load()["projects"].pop(slug, None)
        save()
        return meta or {}


def set_project_meta(slug, **values):
    with _lock:
        projects = load()["projects"]
        meta = projects.setdefault(slug, {})
        for k, v in values.items():
            if v is None:
                meta.pop(k, None)
            else:
                meta[k] = v
        save()


# --- Mot de passe -----------------------------------------------------------

PBKDF2_ITERATIONS = 600_000  # recommandation OWASP pour PBKDF2-HMAC-SHA256


def _hash(password, salt=None, iterations=PBKDF2_ITERATIONS):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations)
    return f"pbkdf2${iterations}${salt}${digest.hex()}"


def check_password(password):
    if not isinstance(password, str):
        return False
    env = os.environ.get("HELMSHELL_PASSWORD")
    if env:
        return hmac.compare_digest(password.encode(), env.encode())
    stored = load().get("password_hash") or ""
    try:
        _, iterations, salt, _digest = stored.split("$")
        iterations = int(iterations)
    except ValueError:
        return False
    ok = hmac.compare_digest(_hash(password, salt, iterations), stored)
    if ok and iterations < PBKDF2_ITERATIONS:  # ancien hachage : renforcé au passage, sans déconnecter personne
        update(password_hash=_hash(password))
    return ok


def set_password(password):
    # Changer le mot de passe change aussi le secret : toutes les sessions sont invalidées.
    update(password_hash=_hash(password), secret=secrets.token_hex(32))
    # Le mot de passe initial n'a plus lieu de rester sur le disque
    try:
        (DATA_DIR / "mot-de-passe-initial.txt").unlink()
    except OSError:
        pass


def ensure_initialized():
    """Crée le secret et, si besoin, un mot de passe initial. Renvoie ce mot de passe s'il vient d'être créé."""
    cfg = load()
    created = None
    if cfg.get("language") not in LANGUAGES:
        # Installation existante (Helmshell n'était qu'en français) : on garde le français.
        # Nouvelle installation : HELMSHELL_LANGUAGE (en/fr), anglais par défaut.
        if _file_existed:
            lang = "fr"
        else:
            lang = (os.environ.get("HELMSHELL_LANGUAGE") or "").strip().lower()[:2]
            lang = lang if lang in LANGUAGES else "en"
        update(language=lang)
    if not cfg.get("secret"):
        update(secret=secrets.token_hex(32))
    if not os.environ.get("HELMSHELL_PASSWORD") and not cfg.get("password_hash"):
        created = secrets.token_urlsafe(12)
        update(password_hash=_hash(created))
        path = DATA_DIR / "mot-de-passe-initial.txt"
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(created + "\n")
    return created


def secret():
    return load()["secret"].encode()
