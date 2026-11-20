"""Fournisseur de déploiement choisi dans Paramètres : aucun, Coolify ou Dokploy.

Les deux clients (coolify.py, dokploy.py) ont la même interface ; le reste de Helmshell passe par ici.
"""
from . import config, coolify, dokploy
from .i18n import _
from .util import ApiError

MODULES = {"coolify": coolify, "dokploy": dokploy}
NAMES = {"coolify": "Coolify", "dokploy": "Dokploy"}
# Identifiant de l'application liée, rangé par fournisseur dans config["projects"][slug]
META_KEYS = {"coolify": "coolify_uuid", "dokploy": "dokploy_id"}
FEATURES = {
    "coolify": {"logs": True, "envs": True, "domains": True, "rollback": True, "create": True, "resources": True},
    "dokploy": {"logs": True, "envs": True, "domains": True, "rollback": False, "create": True, "resources": True},
}


def provider_id():
    v = config.load().get("deploy_provider")
    if v is None:  # installations d'avant ce réglage : Coolify s'il était relié
        return "coolify" if config.get("coolify_token") else ""
    return v if v in MODULES else ""


def provider():
    return MODULES.get(provider_id())


def require():
    p = provider()
    if not p:
        raise ApiError(_("Aucun outil de déploiement n'est configuré (Paramètres › Déploiement)"), 404)
    return p


def configured():
    p = provider()
    return bool(p and p.configured())


def meta_key():
    return META_KEYS.get(provider_id(), "")


def app_id(meta):
    k = meta_key()
    return (meta or {}).get(k, "") if k else ""


def info():
    pid = provider_id()
    url = (config.get(f"{pid}_public_url") or config.get(f"{pid}_url") or "") if pid else ""
    return {"provider": pid, "name": NAMES.get(pid, ""), "url": url, "configured": configured(),
            "features": FEATURES.get(pid, {})}


def invalidate():
    for m in MODULES.values():
        m.invalidate()
