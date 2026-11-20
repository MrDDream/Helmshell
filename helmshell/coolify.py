"""Client minimal de l'API Coolify v4 (jeton créé dans Coolify › Keys & Tokens)."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from . import config
from .i18n import _
from .util import ApiError, log_activity, open_url

_cache = {}


class CoolifyError(ApiError):
    pass


def configured():
    return bool(config.get("coolify_url") and config.get("coolify_token"))


def _call(method, path, body=None, timeout=15):
    if not configured():
        raise CoolifyError(_("Coolify n'est pas configuré (URL et jeton dans Paramètres)"), 400)
    url = config.get("coolify_url").rstrip("/") + "/api/v1" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + config.get("coolify_token"),
        "Accept": "application/json",
        "Content-Type": "application/json",
    })
    try:
        with open_url(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        try:
            j = json.loads(detail)
            detail = j.get("message") or detail
            if j.get("errors"):
                detail += " " + json.dumps(j["errors"], ensure_ascii=False)
        except ValueError:
            pass
        raise CoolifyError(_("Coolify a répondu {code} : {detail}", code=e.code, detail=detail), 502) from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise CoolifyError(_("Coolify injoignable : {reason}", reason=getattr(e, "reason", e)), 502) from None
    return json.loads(raw) if raw else {}


def _cached(key, fn, ttl=15):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


def invalidate():
    _cache.clear()


def _app_view(a):
    pack = a.get("build_pack") or ""
    # Appli créée depuis une image ou un Dockerfile : Coolify laisse « coollabsio/coolify » comme dépôt par défaut
    image = pack in ("dockerimage", "dockerfile")
    repo = "" if image else (a.get("git_repository") or "")
    if pack == "dockerimage":
        name, tag = a.get("docker_registry_image_name") or "", a.get("docker_registry_image_tag") or ""
        source = f"Image {name}:{tag}" if tag else f"Image {name}"
    elif pack == "dockerfile":
        source = "Dockerfile"
    else:
        source = repo + (f" · {a['git_branch']}" if repo and a.get("git_branch") else "") if repo else pack
    return {
        "uuid": a.get("uuid"), "name": a.get("name"), "status": a.get("status") or "",
        "fqdn": a.get("fqdn") or "", "repo": repo, "source": source,
        "branch": a.get("git_branch") or "", "build_pack": pack,
        "updated": a.get("updated_at") or "",
    }


def deploy_status_label(status):
    """Libellé d'un état de déploiement Coolify, dans la langue réglée (l'état brut s'il est inconnu)."""
    labels = {"finished": _("Terminé"), "failed": _("Échec"), "in_progress": _("En cours"),
              "queued": _("En attente"), "cancelled-by-user": _("Annulé"), "cancelled": _("Annulé")}
    return labels.get(status, status)


def _deploy_label(d):
    """Libellé lisible d'un déploiement : message du commit, sinon ce qui l'a déclenché."""
    msg = (d.get("commit_message") or "").strip().split("\n")[0]
    if msg:
        return msg
    if d.get("rollback"):
        return _("Retour en arrière")
    if d.get("restart_only"):
        return _("Redémarrage")
    if d.get("force_rebuild"):
        return _("Reconstruction sans cache")
    if d.get("is_webhook"):
        return _("Push sur le dépôt")
    commit = d.get("commit") or ""
    if commit and commit != "HEAD":
        return _("Commit {commit}", commit=commit[:7])
    return _("Déploiement lancé depuis Helmshell") if d.get("is_api") else _("Déploiement manuel")


def apps():
    return _cached("apps", lambda: [_app_view(a) for a in _call("GET", "/applications")])


def app(uuid):
    return _app_view(_call("GET", f"/applications/{urllib.parse.quote(uuid)}"))


def deploy(uuid, force=False):
    q = urllib.parse.urlencode({"uuid": uuid, "force": "true" if force else "false"})
    # Coolify v4 récent : POST obligatoire (le GET répond 405 « This endpoint has changed to a POST request »)
    res = _call("POST", f"/deploy?{q}", {"uuid": uuid, "force": force}, timeout=30)
    invalidate()
    name = next((a["name"] for a in apps() if a["uuid"] == uuid), uuid)
    log_activity(_("Déploiement de {name} lancé sur Coolify", name=name), "deploy")
    return res


def app_action(uuid, action):
    """Démarrer, arrêter ou redémarrer une application."""
    if action not in ("start", "stop", "restart"):
        raise ApiError(_("Action inconnue"))
    res = _call("POST", f"/applications/{urllib.parse.quote(uuid)}/{action}", {}, timeout=30)
    invalidate()
    name = next((a["name"] for a in apps() if a["uuid"] == uuid), uuid)
    text = {"start": _("Application {name} démarrée sur Coolify", name=name),
            "stop": _("Application {name} arrêtée sur Coolify", name=name),
            "restart": _("Application {name} redémarrée sur Coolify", name=name)}[action]
    log_activity(text, "stop" if action == "stop" else "deploy")
    return res


def delete_app(uuid):
    """Supprime l'application dans Coolify (conteneurs, volumes, configuration). Irréversible."""
    name = next((a["name"] for a in apps() if a["uuid"] == uuid), uuid)
    q = urllib.parse.urlencode({"delete_configurations": "true", "delete_volumes": "true",
                                "docker_cleanup": "true", "delete_connected_networks": "true"})
    res = _call("DELETE", f"/applications/{urllib.parse.quote(uuid)}?{q}", timeout=30)
    invalidate()
    # Les projets Helmshell reliés à cette application ne le sont plus
    for slug, meta in list(config.load()["projects"].items()):
        if meta.get("coolify_uuid") == uuid:
            config.set_project_meta(slug, coolify_uuid=None)
    log_activity(_("Application {name} supprimée de Coolify", name=name), "stop")
    return res


def deployments():
    """Déploiements en cours / en file d'attente."""
    res = _call("GET", "/deployments")
    return [{
        "uuid": d.get("deployment_uuid") or d.get("uuid"), "app": d.get("application_name"),
        "app_uuid": d.get("application_id"), "status": d.get("status"), "created": d.get("created_at"),
    } for d in (res if isinstance(res, list) else [])]


def app_deployments(uuid, take=10):
    try:
        res = _call("GET", f"/deployments/applications/{urllib.parse.quote(uuid)}?skip=0&take={take}")
    except CoolifyError:
        return []
    items = res.get("deployments", res) if isinstance(res, dict) else res
    return [{
        "uuid": d.get("deployment_uuid"), "status": d.get("status"),
        "status_label": deploy_status_label(d.get("status") or ""),
        "commit": "" if (d.get("commit") or "") == "HEAD" else (d.get("commit") or "")[:7],
        "message": d.get("commit_message") or "", "label": _deploy_label(d), "created": d.get("created_at"),
        "finished": d.get("finished_at") or d.get("updated_at"),
    } for d in (items or [])]


def set_domains(uuid, domains):
    res = _call("PATCH", f"/applications/{urllib.parse.quote(uuid)}", {"domains": domains})
    invalidate()
    log_activity(_("Domaine mis à jour : {domains}", domains=domains), "domain")
    return res


def meta():
    projects = _call("GET", "/projects")
    servers = _call("GET", "/servers")
    return {
        "projects": [{"uuid": p.get("uuid"), "name": p.get("name")} for p in projects],
        "servers": [{"uuid": s.get("uuid"), "name": s.get("name"), "ip": s.get("ip")} for s in servers],
    }


def create_public_app(name, repo, domain=""):
    project_uuid = config.get("coolify_project_uuid")
    server_uuid = config.get("coolify_server_uuid")
    if not project_uuid or not server_uuid:
        m = meta()
        project_uuid = project_uuid or (m["projects"][0]["uuid"] if m["projects"] else "")
        server_uuid = server_uuid or (m["servers"][0]["uuid"] if m["servers"] else "")
    if not project_uuid or not server_uuid:
        raise CoolifyError(_("Aucun projet ou serveur Coolify trouvé"))
    body = {
        "project_uuid": project_uuid, "server_uuid": server_uuid,
        "environment_name": config.get("coolify_environment") or "production",
        "git_repository": repo, "git_branch": "main", "build_pack": "nixpacks",
        "ports_exposes": "3000", "name": name, "instant_deploy": False,
    }
    if domain:
        body["domains"] = domain
    res = _call("POST", "/applications/public", body, timeout=30)
    invalidate()
    log_activity(_("Application {name} créée dans Coolify", name=name), "deploy")
    return res


# --- Détails d'une application : logs, variables, retour arrière -------------------

def _q(uuid):
    return urllib.parse.quote(uuid or "", safe="")


def logs(uuid, lines=200):
    res = _call("GET", f"/applications/{_q(uuid)}/logs?lines={max(10, min(int(lines), 2000))}", timeout=20)
    return res.get("logs", "") if isinstance(res, dict) else str(res)


def envs(uuid):
    res = _call("GET", f"/applications/{_q(uuid)}/envs")
    out = []
    for e in res if isinstance(res, list) else []:
        if e.get("is_preview"):
            continue
        out.append({"uuid": e.get("uuid"), "key": e.get("key"), "value": e.get("value") or "",
                    "build": bool(e.get("is_buildtime") or e.get("is_build_time")),
                    "literal": bool(e.get("is_literal")), "multiline": bool(e.get("is_multiline"))})
    return sorted(out, key=lambda e: e["key"] or "")


def set_env(uuid, key, value, create=False):
    key = (key or "").strip()
    if not key or not all(c.isalnum() or c == "_" for c in key):
        raise CoolifyError(_("Nom de variable invalide (lettres, chiffres et _)"), 400)
    body = {"key": key, "value": value}
    _call("POST" if create else "PATCH", f"/applications/{_q(uuid)}/envs", body)
    log_activity(_("Variable {key} ajoutée dans Coolify", key=key) if create
                 else _("Variable {key} modifiée dans Coolify", key=key), "deploy")


def delete_env(uuid, env_uuid):
    _call("DELETE", f"/applications/{_q(uuid)}/envs/{_q(env_uuid)}")
    log_activity(_("Variable supprimée dans Coolify"), "deploy")


def rollback_images(uuid):
    res = _call("GET", f"/applications/{_q(uuid)}/rollback-images")
    return res


def rollback(uuid, commit):
    if not commit or not all(c.isalnum() or c in "._-" for c in commit):
        raise CoolifyError(_("Version invalide"), 400)
    res = _call("POST", f"/applications/{_q(uuid)}/rollback", {"commit": commit}, timeout=30)
    invalidate()
    log_activity(_("Retour à la version {commit} demandé sur Coolify", commit=commit[:12]), "deploy")
    return res


def resources():
    """Toutes les ressources Coolify (applications, services, bases) avec leur état."""
    def load():
        out = []
        for r in _call("GET", "/resources"):
            out.append({"uuid": r.get("uuid"), "name": r.get("name"), "type": r.get("type") or "",
                        "status": r.get("status") or "", "updated": r.get("updated_at") or ""})
        return out
    return _cached("resources", load)
