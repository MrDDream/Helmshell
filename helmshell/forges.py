"""Comptes Git liés : GitHub, GitLab, Gitea, Forgejo, Codeberg.

Un compte = une forge + un jeton d'accès personnel. Helmshell s'en sert pour :
- lister les dépôts (bouton « Importer » d'un nouveau projet) ;
- authentifier `git clone`, `git pull` et `git push` vers cette forge en HTTPS. Le jeton passe par
  l'environnement de git (GIT_CONFIG_*), jamais par la ligne de commande ni par le .git/config du dépôt.
"""
import base64
import json
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from . import config
from .i18n import _
from .util import ApiError, open_url

# preset -> (famille d'API, adresse par défaut, nom affiché)
KINDS = {
    "github": ("github", "https://github.com", "GitHub"),
    "gitlab": ("gitlab", "https://gitlab.com", "GitLab"),
    "codeberg": ("gitea", "https://codeberg.org", "Codeberg"),
    "forgejo": ("gitea", "", "Forgejo"),
    "gitea": ("gitea", "", "Gitea"),
}
ACCESS = {"read": "Lecture", "write": "Lecture et écriture", "full": "Complet"}
_cache = {}
_lock = threading.Lock()


def _all():
    return list(config.get("forges") or [])


def public(f):
    return ({k: f.get(k, "") for k in ("id", "kind", "url", "user", "name", "avatar")}
            | {"access": f.get("access") or "write", "token_set": bool(f.get("token"))})


def list_public():
    return [public(f) for f in _all()]


def get(fid):
    for f in _all():
        if f.get("id") == fid:
            return f
    raise ApiError(_("Compte Git introuvable"), 404)


def _norm_url(url):
    url = (url or "").strip().rstrip("/")
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ("http", "https") or not u.netloc or u.query or u.fragment:
        raise ApiError(_("Adresse attendue sous la forme https://git.exemple.fr"))
    return url


def _api_base(f):
    family = KINDS[f["kind"]][0]
    url = f["url"]
    if family == "github":
        return "https://api.github.com" if urllib.parse.urlsplit(url).netloc == "github.com" else url + "/api/v3"
    if family == "gitlab":
        return url + "/api/v4"
    return url + "/api/v1"


def _headers(f):
    family = KINDS[f["kind"]][0]
    h = {"Accept": "application/json", "User-Agent": "Helmshell/1.0"}
    token = f.get("token") or ""
    if family == "github":
        h["X-GitHub-Api-Version"] = "2022-11-28"
        if token:
            h["Authorization"] = "Bearer " + token
    elif family == "gitlab":
        if token:
            h["PRIVATE-TOKEN"] = token
    elif token:
        h["Authorization"] = "token " + token
    return h


def _get(f, path, params=None):
    url = _api_base(f) + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers=_headers(f))
    forge = KINDS[f["kind"]][2]
    try:
        with open_url(req, timeout=15) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ApiError(_("{forge} refuse le jeton (droits insuffisants ou jeton expiré)", forge=forge), 400) from None
        raise ApiError(_("{forge} : erreur {code}", forge=forge, code=e.code), 502) from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ApiError(_("{forge} injoignable : {reason}", forge=forge, reason=getattr(e, "reason", e)), 502) from None
    except ValueError:
        raise ApiError(_("{forge} : réponse illisible", forge=forge), 502) from None


def _whoami(f):
    family = KINDS[f["kind"]][0]
    u = _get(f, "/user") or {}
    login = u.get("username") if family == "gitlab" else u.get("login")
    if not login:
        raise ApiError(_("Impossible de lire le compte associé au jeton"), 400)
    return {"user": login, "name": u.get("name") or "", "avatar": u.get("avatar_url") or ""}


def add(kind, url, token, access="write"):
    if kind not in KINDS:
        raise ApiError(_("Forge inconnue"))
    if access not in ACCESS:
        raise ApiError(_("Niveau d'accès inconnu"))
    token = (token or "").strip()
    if not token:
        raise ApiError(_("Colle un jeton d'accès"))
    url = _norm_url(url or KINDS[kind][1])
    f = {"id": secrets.token_hex(4), "kind": kind, "url": url, "token": token, "access": access}
    f.update(_whoami(f))
    with _lock:
        items = [x for x in _all() if not (x.get("url") == url and x.get("user") == f["user"])]
        items.append(f)
        config.update(forges=items)
    return public(f)


def remove(fid):
    with _lock:
        items = _all()
        if not any(x.get("id") == fid for x in items):
            raise ApiError(_("Compte Git introuvable"), 404)
        config.update(forges=[x for x in items if x.get("id") != fid])
    _cache.pop(fid, None)


def _repo(family, r):
    if family == "gitlab":
        return {"name": r.get("path") or r.get("name"), "full_name": r.get("path_with_namespace"),
                "description": r.get("description") or "", "private": r.get("visibility") != "public",
                "clone_url": r.get("http_url_to_repo"), "ssh_url": r.get("ssh_url_to_repo"),
                "web_url": r.get("web_url"), "updated": r.get("last_activity_at") or "",
                "fork": bool(r.get("forked_from_project")), "archived": bool(r.get("archived"))}
    return {"name": r.get("name"), "full_name": r.get("full_name"), "description": r.get("description") or "",
            "private": bool(r.get("private")), "clone_url": r.get("clone_url"), "ssh_url": r.get("ssh_url"),
            "web_url": r.get("html_url"), "updated": r.get("pushed_at") or r.get("updated_at") or "",
            "fork": bool(r.get("fork")), "archived": bool(r.get("archived")), "language": r.get("language") or ""}


def repos(fid, fresh=False):
    """Dépôts du compte (propriétaire, collaborateur, organisations), les plus récents d'abord."""
    f = get(fid)
    hit = _cache.get(fid)
    if hit and not fresh and time.time() - hit[0] < 120:
        return hit[1]
    family = KINDS[f["kind"]][0]
    out = []
    for page in range(1, 6):
        if family == "github":
            batch = _get(f, "/user/repos", {"per_page": 100, "page": page, "sort": "pushed",
                                            "affiliation": "owner,collaborator,organization_member"})
        elif family == "gitlab":
            batch = _get(f, "/projects", {"membership": "true", "per_page": 100, "page": page,
                                          "order_by": "last_activity_at", "simple": "true"})
        else:
            batch = _get(f, "/user/repos", {"limit": 50, "page": page})
        if not isinstance(batch, list) or not batch:
            break
        out += [_repo(family, r) for r in batch]
        if len(batch) < (50 if family == "gitea" else 100):
            break
    out = [r for r in out if r.get("clone_url")]
    out.sort(key=lambda r: r["updated"], reverse=True)
    _cache[fid] = (time.time(), out)
    return out


PUBLIC_HOSTS = {"github.com": "github", "gitlab.com": "gitlab", "codeberg.org": "codeberg"}


def repo_info(url):
    """Description d'un dépôt distant, via le compte lié de la forge (ou anonymement pour les grandes forges)."""
    url = (url or "").strip()
    ssh = re.match(r"^[\w.-]+@([^:]+):(.+)$", url)
    if ssh:
        host, path = ssh.group(1), ssh.group(2)
    else:
        u = urllib.parse.urlsplit(url)
        host, path = u.netloc.split("@")[-1], u.path
    host = host.lower()
    path = path.strip("/").removesuffix(".git")
    if not host or path.count("/") < 1:
        return None
    f = next((x for x in _all() if urllib.parse.urlsplit(x.get("url") or "").netloc.lower() == host), None)
    if not f:
        kind = PUBLIC_HOSTS.get(host)
        if not kind:
            return None
        f = {"kind": kind, "url": "https://" + host, "token": ""}
    family = KINDS[f["kind"]][0]
    try:
        if family == "gitlab":
            r = _get(f, "/projects/" + urllib.parse.quote(path, safe=""))
        else:
            r = _get(f, "/repos/" + path)
    except ApiError:
        return None
    if not isinstance(r, dict):
        return None
    return {"description": (r.get("description") or "").strip(), "topics": r.get("topics") or r.get("tag_list") or []}


def _git_user(f):
    family = KINDS[f["kind"]][0]
    return {"github": "x-access-token", "gitlab": "oauth2"}.get(family) or f.get("user") or "git"


def git_env(url, env, write=False):
    """Ajoute à `env` l'authentification HTTPS du compte lié qui correspond à `url` (si besoin).

    write=True (push) : un jeton en lecture seule n'est pas utilisé, git garde ses propres identifiants."""
    u = urllib.parse.urlsplit((url or "").strip())
    if u.scheme != "https" or not u.netloc:
        return env
    host = u.netloc.split("@")[-1].lower()
    for f in _all():
        fu = urllib.parse.urlsplit(f.get("url") or "")
        if fu.netloc.lower() == host and f.get("token") and not (write and f.get("access") == "read"):
            basic = base64.b64encode(f"{_git_user(f)}:{f['token']}".encode()).decode()
            n = int(env.get("GIT_CONFIG_COUNT") or 0)
            env[f"GIT_CONFIG_KEY_{n}"] = f"http.https://{host}/.extraheader"
            env[f"GIT_CONFIG_VALUE_{n}"] = "Authorization: Basic " + basic
            env["GIT_CONFIG_COUNT"] = str(n + 1)
            break
    env.setdefault("GIT_TERMINAL_PROMPT", "0")
    return env
