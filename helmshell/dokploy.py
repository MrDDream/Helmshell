"""Client minimal de l'API Dokploy (clé créée dans Dokploy › Settings › Profile › API/CLI).

Même interface et mêmes formes de données que coolify.py : le reste de Helmshell ne voit pas la différence.
L'API Dokploy expose des procédures : GET/POST {url}/api/<routeur>.<procédure>, en-tête x-api-key.
Ses réponses ne sont pas documentées en détail : on lit les champs de façon tolérante.
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from . import config
from .i18n import _
from .util import ApiError, log_activity, open_url

_cache = {}
KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
# État d'une application Dokploy → chaînes déjà comprises par l'interface (comme Coolify)
STATUS = {"done": "running:healthy", "running": "starting", "error": "degraded", "idle": "exited"}
DEPLOY_STATUS = {"done": "finished", "error": "failed", "running": "in_progress", "queued": "queued",
                 "cancelled": "cancelled"}


def deploy_label(status):
    """Libellé d'un état de déploiement (déjà converti façon Coolify), dans la langue réglée."""
    labels = {"finished": _("Terminé"), "failed": _("Échec"), "in_progress": _("En cours"),
              "queued": _("En attente"), "cancelled": _("Annulé")}
    return labels.get(status, status)


class DokployError(ApiError):
    pass


def configured():
    return bool(config.get("dokploy_url") and config.get("dokploy_token"))


def _call(method, proc, params=None, body=None, timeout=15):
    if not configured():
        raise DokployError(_("Dokploy n'est pas configuré (URL et clé d'API dans Paramètres)"), 400)
    url = config.get("dokploy_url").rstrip("/") + "/api/" + proc
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body if body is not None else {}).encode() if method == "POST" else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "x-api-key": config.get("dokploy_token"), "Accept": "application/json",
        "Content-Type": "application/json", "User-Agent": "Helmshell",
    })
    try:
        with open_url(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        try:
            j = json.loads(detail)
            detail = j.get("message") or (j.get("error") or {}).get("message") or detail
        except (ValueError, AttributeError):
            pass
        raise DokployError(_("Dokploy a répondu {code} : {detail}", code=e.code, detail=detail), 502) from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise DokployError(_("Dokploy injoignable : {reason}", reason=getattr(e, "reason", e)), 502) from None
    if not raw:
        return {}
    try:
        res = json.loads(raw)
    except ValueError:
        return raw.decode(errors="replace")
    # Certaines versions enveloppent la réponse façon tRPC
    if isinstance(res, dict) and set(res) == {"result"} and isinstance(res["result"], dict):
        res = res["result"].get("data", res["result"])
        if isinstance(res, dict) and set(res) == {"json"}:
            res = res["json"]
    return res


def _cached(key, fn, ttl=15):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


def invalidate():
    _cache.clear()


def _projects():
    res = _cached("projects", lambda: _call("GET", "project.all"))
    return res if isinstance(res, list) else []


def _walk():
    """(projet, environnement, groupe, élément) pour chaque ressource, anciennes versions comprises."""
    groups = ("applications", "compose", "postgres", "mysql", "mariadb", "mongo", "redis", "libsql")
    for p in _projects():
        envs = p.get("environments") or [{"name": "", "environmentId": "", **{g: p.get(g) for g in groups}}]
        for e in envs:
            for g in groups:
                for item in e.get(g) or []:
                    yield p, e, g, item


def _url(d):
    host = d.get("host") or ""
    if not host:
        return ""
    path = d.get("path") or ""
    return f"{'https' if d.get('https') else 'http'}://{host}{path if path not in ('', '/') else ''}"


def _repo(a):
    st = a.get("sourceType") or ""
    if st == "git":
        return a.get("customGitUrl") or ""
    owner = a.get("owner") or a.get("gitlabOwner") or a.get("giteaOwner") or a.get("bitbucketOwner") or ""
    repo = a.get("repository") or a.get("gitlabRepository") or a.get("giteaRepository") or a.get("bitbucketRepository") or ""
    if not repo:
        return ""
    base = {"github": "https://github.com", "gitlab": "https://gitlab.com", "bitbucket": "https://bitbucket.org"}.get(st, "")
    return f"{base}/{owner}/{repo}" if base and owner else repo


def _app_view(a, env_label=""):
    st = a.get("sourceType") or ""
    repo = _repo(a)
    branch = a.get("branch") or a.get("customGitBranch") or a.get("gitlabBranch") or a.get("giteaBranch") or ""
    if st == "docker":
        source = f"Image {a.get('dockerImage') or ''}".strip()
    elif st == "drop":
        source = _("Archive envoyée")
    else:
        source = repo + (f" · {branch}" if repo and branch else "") if repo else (a.get("buildType") or st)
    return {
        "uuid": a.get("applicationId"), "name": a.get("name") or a.get("appName"),
        "status": STATUS.get(a.get("applicationStatus") or "", a.get("applicationStatus") or ""),
        "fqdn": ",".join(filter(None, (_url(d) for d in a.get("domains") or []))),
        "repo": repo, "source": source, "branch": branch, "build_pack": a.get("buildType") or "",
        "updated": a.get("updatedAt") or a.get("createdAt") or "", "app_name": a.get("appName") or "",
        "env": env_label,
    }


def apps():
    def load():
        out = []
        for p, e, g, a in _walk():
            if g == "applications" and a.get("applicationId"):
                label = p.get("name", "") + (f" · {e.get('name')}" if e.get("name") else "")
                out.append(_app_view(a, label))
        return out
    return _cached("apps", load)


def _one(uuid):
    a = _call("GET", "application.one", {"applicationId": uuid})
    if not isinstance(a, dict) or not a:
        raise DokployError(_("Application introuvable dans Dokploy"), 404)
    return a


def app(uuid):
    return _app_view(_one(uuid))


def _name(uuid):
    return next((a["name"] for a in apps() if a["uuid"] == uuid), uuid)


def deploy(uuid, force=False):
    res = _call("POST", "application.redeploy" if force else "application.deploy",
                body={"applicationId": uuid, "title": _("Déploiement lancé depuis Helmshell")}, timeout=30)
    invalidate()
    log_activity(_("Déploiement de {name} lancé sur Dokploy (reconstruction)", name=_name(uuid)) if force
                 else _("Déploiement de {name} lancé sur Dokploy", name=_name(uuid)), "deploy")
    return res


def app_action(uuid, action):
    if action == "restart":
        a = _one(uuid)
        res = _call("POST", "application.reload", body={"applicationId": uuid, "appName": a.get("appName")}, timeout=30)
    else:
        res = _call("POST", f"application.{action}", body={"applicationId": uuid}, timeout=30)
    invalidate()
    name = _name(uuid)
    text = {"start": _("Application {name} démarrée sur Dokploy", name=name),
            "stop": _("Application {name} arrêtée sur Dokploy", name=name),
            "restart": _("Application {name} redémarrée sur Dokploy", name=name)}[action]
    log_activity(text, "stop" if action == "stop" else "deploy")
    return res


def delete_app(uuid):
    name = _name(uuid)
    res = _call("POST", "application.delete", body={"applicationId": uuid}, timeout=30)
    invalidate()
    for slug, meta in list(config.load()["projects"].items()):
        if meta.get("dokploy_id") == uuid:
            config.set_project_meta(slug, dokploy_id=None)
    log_activity(_("Application {name} supprimée de Dokploy", name=name), "stop")
    return res


def deployments():
    """Déploiements en cours : les applications dont l'état est « running »."""
    out = []
    for p, e, g, a in _walk():
        if g == "applications" and a.get("applicationStatus") == "running":
            out.append({"uuid": a.get("applicationId"), "app": a.get("name"), "app_uuid": a.get("applicationId"),
                        "status": "in_progress", "created": a.get("updatedAt") or ""})
    return out


def app_deployments(uuid, take=10):
    try:
        res = _call("GET", "deployment.all", {"applicationId": uuid})
    except DokployError:
        return []
    items = sorted(res if isinstance(res, list) else [], key=lambda d: d.get("createdAt") or "", reverse=True)
    out = []
    for d in items[:take]:
        st = DEPLOY_STATUS.get(d.get("status") or "", d.get("status") or "")
        title = (d.get("title") or "").strip()
        out.append({"uuid": d.get("deploymentId"), "status": st, "status_label": deploy_label(st),
                    "commit": "", "message": d.get("description") or "", "label": title or _("Déploiement"),
                    "created": d.get("createdAt"), "finished": d.get("finishedAt") or d.get("updatedAt")})
    return out


def set_domains(uuid, domains):
    """domains : URL complètes séparées par des virgules (comme pour Coolify)."""
    want = {}
    for raw in filter(None, (x.strip() for x in (domains or "").split(","))):
        u = urllib.parse.urlsplit(raw if "://" in raw else "https://" + raw)
        if not u.hostname:
            raise DokployError(_("Adresse invalide : {address}", address=raw), 400)
        want[u.hostname.lower()] = {"https": u.scheme == "https", "path": u.path or "/"}
    have = _call("GET", "domain.byApplicationId", {"applicationId": uuid})
    have = have if isinstance(have, list) else []
    port = next((d.get("port") for d in have if d.get("port")), None) or 3000
    for d in have:
        if (d.get("host") or "").lower() not in want:
            _call("POST", "domain.delete", body={"domainId": d.get("domainId")})
    known = {(d.get("host") or "").lower() for d in have}
    for host, o in want.items():
        if host not in known:
            _call("POST", "domain.create", body={
                "host": host, "path": o["path"], "port": port, "https": o["https"],
                "certificateType": "letsencrypt" if o["https"] else "none",
                "applicationId": uuid, "domainType": "application"})
    invalidate()
    log_activity(_("Domaine mis à jour : {domains}", domains=domains), "domain")
    return {"ok": True}


def meta():
    projects, envs = [], []
    for p in _projects():
        projects.append({"uuid": p.get("projectId"), "name": p.get("name")})
        for e in p.get("environments") or []:
            envs.append({"uuid": e.get("environmentId"), "name": f"{p.get('name')} · {e.get('name')}",
                         "project": p.get("projectId")})
    try:
        srv = _call("GET", "server.all")
    except DokployError:
        srv = []
    servers = [{"uuid": s.get("serverId"), "name": s.get("name"), "ip": s.get("ipAddress")}
               for s in (srv if isinstance(srv, list) else [])]
    return {"projects": projects, "environments": envs, "servers": servers}


def _environment_id():
    env_id = config.get("dokploy_environment_id")
    if env_id:
        return env_id
    m = meta()
    proj = config.get("dokploy_project_id")
    cand = [e for e in m["environments"] if not proj or e["project"] == proj]
    if not cand:
        raise DokployError(_("Aucun environnement Dokploy trouvé : crée un projet dans Dokploy"), 400)
    return cand[0]["uuid"]


def create_public_app(name, repo, domain=""):
    env_id = _environment_id()
    app_name = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")[:40] or "app"
    body = {"name": name, "appName": app_name, "environmentId": env_id}
    if config.get("dokploy_server_id"):
        body["serverId"] = config.get("dokploy_server_id")
    res = _call("POST", "application.create", body=body, timeout=30)
    uuid = res.get("applicationId") if isinstance(res, dict) else None
    if not uuid:  # réponse vide selon les versions : on la retrouve par son nom
        invalidate()
        uuid = next((a["uuid"] for a in apps() if a["name"] == name), None)
    if not uuid:
        raise DokployError(_("Application créée, mais Dokploy n'a pas renvoyé son identifiant"), 502)
    _call("POST", "application.saveGitProvider", body={
        "applicationId": uuid, "customGitUrl": repo, "customGitBranch": "main", "customGitBuildPath": "/",
        "watchPaths": None, "enableSubmodules": False}, timeout=30)
    _call("POST", "application.saveBuildType", body={
        "applicationId": uuid, "buildType": "nixpacks", "dockerfile": None, "dockerContextPath": None,
        "dockerBuildStage": None, "herokuVersion": None, "railpackVersion": None}, timeout=30)
    if domain:
        set_domains(uuid, domain)
    invalidate()
    log_activity(_("Application {name} créée dans Dokploy", name=name), "deploy")
    return {"uuid": uuid}


def logs(uuid, lines=200):
    try:
        res = _call("GET", "application.readLogs", {"applicationId": uuid, "tail": max(10, min(int(lines), 2000))},
                    timeout=20)
    except DokployError as e:
        raise DokployError(_("Journaux indisponibles par l'API de cette version de Dokploy : ouvre-les dans Dokploy. "
                             "({error})", error=e), 502) from None
    if isinstance(res, dict):
        res = res.get("logs") or res.get("data") or ""
    if isinstance(res, list):
        res = "\n".join(map(str, res))
    return str(res)


# --- Variables : Dokploy les garde en un seul bloc « CLE=valeur » ------------------------

def _parse_env(text):
    out = []
    for line in (text or "").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        out.append((k, v))
    return out


def _env_line(k, v):
    return f'{k}="{v}"' if any(c in v for c in " #\"'") and "\n" not in v else f"{k}={v}"


def envs(uuid):
    a = _one(uuid)
    return sorted(({"uuid": k, "key": k, "value": v, "build": False, "literal": False, "multiline": False}
                   for k, v in _parse_env(a.get("env"))), key=lambda e: e["key"])


def _save_env(uuid, a, pairs):
    _call("POST", "application.saveEnvironment", body={
        "applicationId": uuid, "env": "\n".join(_env_line(k, v) for k, v in pairs),
        "buildArgs": a.get("buildArgs"), "buildSecrets": a.get("buildSecrets"),
        "createEnvFile": a.get("createEnvFile") if a.get("createEnvFile") is not None else True})


def set_env(uuid, key, value, create=False):
    key = (key or "").strip()
    if not KEY_RE.match(key):
        raise DokployError(_("Nom de variable invalide (lettres, chiffres et _)"), 400)
    if "\n" in value:
        raise DokployError(_("Valeur sur plusieurs lignes non prise en charge avec Dokploy"), 400)
    a = _one(uuid)
    pairs = _parse_env(a.get("env"))
    if any(k == key for k, _x in pairs):
        pairs = [(k, value if k == key else v) for k, v in pairs]
    else:
        pairs.append((key, value))
    _save_env(uuid, a, pairs)
    log_activity(_("Variable {key} ajoutée dans Dokploy", key=key) if create
                 else _("Variable {key} modifiée dans Dokploy", key=key), "deploy")


def delete_env(uuid, env_uuid):
    a = _one(uuid)
    pairs = [(k, v) for k, v in _parse_env(a.get("env")) if k != env_uuid]
    _save_env(uuid, a, pairs)
    log_activity(_("Variable {key} supprimée dans Dokploy", key=env_uuid), "deploy")


def rollback_images(uuid):
    return []


def rollback(uuid, commit):
    raise DokployError(_("Le retour à une version précédente se fait depuis Dokploy"), 400)


def resources():
    kinds = {"applications": "application", "compose": "service"}
    status = {"done": "running", "running": "starting", "error": "degraded", "idle": "exited"}

    def load():
        out = []
        for p, e, g, r in _walk():
            rid = r.get("applicationId") or r.get("composeId") or r.get(f"{g}Id")
            out.append({"uuid": rid or r.get("appName"), "name": r.get("name") or r.get("appName"),
                        "type": kinds.get(g, f"standalone-{g}"),
                        "status": status.get(r.get("applicationStatus") or r.get("composeStatus") or "", ""),
                        "updated": r.get("updatedAt") or r.get("createdAt") or ""})
        return out
    return _cached("resources", load)
