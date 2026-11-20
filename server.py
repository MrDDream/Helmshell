#!/usr/bin/env python3
"""Helmshell — serveur web (bibliothèque standard Python uniquement).

    python3 server.py            # écoute sur 0.0.0.0:8787
    HELMSHELL_PORT=9000 python3 server.py
"""
import base64
import hashlib
import hmac
import ipaddress
import json
import mimetypes
import os
import re
import sys
import threading
import time
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from helmshell import access, agents, branches, claude, codex, config, deployer, events, forges, notify, oidc, projects, system, tasks, terminal, totp, usage
from helmshell.i18n import _, lang
from helmshell.util import ApiError, log_activity, log_login, recent_activity

STATIC = Path(__file__).resolve().parent / "static"
COOKIE = "helmshell"
SESSION_DAYS = 7    # glissant : le cookie est renouvelé à l'usage
MAX_UPLOAD = 512 * 1024 * 1024
# Bibliothèques servies par Helmshell (static/vendor) : aucun script externe autorisé.
CSP = ("default-src 'self'; script-src 'self'; worker-src 'self'; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; "
       "object-src 'none'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
SAFE_INLINE = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/x-icon", "image/svg+xml"}
PDF = "application/pdf"

_fails = {}
_fails_lock = threading.Lock()


# --- Authentification -------------------------------------------------------

# Jeton de session : « génération.expiration.signature ». La génération (session_epoch) change pour
# déconnecter tous les appareils d'un coup (bouton dédié, 2FA, réglages OIDC) ; le changement de mot de
# passe, lui, régénère le secret.
def _epoch():
    try:
        return int(config.get("session_epoch") or 0)
    except (TypeError, ValueError):
        return 0


def _sign(payload):
    return hmac.new(config.secret(), payload.encode(), hashlib.sha256).hexdigest()


def make_token():
    payload = f"{_epoch()}.{int(time.time()) + SESSION_DAYS * 86400}"
    return f"{payload}.{_sign(payload)}"


def token_exp(token):
    """Expiration d'un jeton valide, sinon None."""
    try:
        epoch, exp, sig = token.split(".")
        if not hmac.compare_digest(sig, _sign(f"{epoch}.{exp}")) or int(epoch) != _epoch():
            return None
        return int(exp) if int(exp) > time.time() else None
    except (ValueError, AttributeError, TypeError):
        return None


def valid_token(token):
    return token_exp(token) is not None


def revoke_sessions(req=None):
    """Déconnecte tous les appareils ; celui qui fait la demande reçoit un nouveau cookie."""
    config.update(session_epoch=_epoch() + 1)
    if req is not None:
        req.extra_headers.append(("Set-Cookie", req.cookie_header(make_token())))


# Limitation des tentatives : enregistrée AVANT la vérification (pas de course pendant le hachage),
# par IP (IPv6 regroupées par /64) et au total, 10 minutes glissantes.
FAIL_WINDOW = 600
FAIL_MAX = int(os.environ.get("HELMSHELL_LOGIN_MAX_FAILS") or 8)      # par IP (réglable pour les tests)
FAIL_GLOBAL = max(50, FAIL_MAX * 3)                                    # toutes IP confondues


def _fail_key(ip):
    try:
        a = ipaddress.ip_address(ip)
        if a.version == 6 and not getattr(a, "ipv4_mapped", None):
            return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    except ValueError:
        pass
    return ip


def _purge(now):
    for k in list(_fails):
        _fails[k] = [t for t in _fails[k] if now - t < FAIL_WINDOW]
        if not _fails[k]:
            del _fails[k]


def too_many_failures(ip):
    with _fails_lock:
        _purge(time.time())
        return (len(_fails.get(_fail_key(ip), [])) >= FAIL_MAX
                or sum(len(v) for v in _fails.values()) >= FAIL_GLOBAL)


def begin_attempt(ip):
    """Réserve une tentative ; None si la limite est atteinte. À annuler (end_attempt) en cas de succès."""
    with _fails_lock:
        now = time.time()
        _purge(now)
        key = _fail_key(ip)
        if len(_fails.get(key, [])) >= FAIL_MAX or sum(len(v) for v in _fails.values()) >= FAIL_GLOBAL:
            return None
        _fails.setdefault(key, []).append(now)
        return (key, now)


def end_attempt(handle):
    with _fails_lock:
        key, t = handle
        if t in _fails.get(key, []):
            _fails[key].remove(t)


def note_failure(ip):
    with _fails_lock:
        _fails.setdefault(_fail_key(ip), []).append(time.time())


# --- Routes -------------------------------------------------------------------

ROUTES = []


def route(method, pattern):
    rx = re.compile("^" + pattern + "$")

    def deco(fn):
        ROUTES.append((method, rx, fn))
        return fn
    return deco


S = r"(?P<slug>[A-Za-z0-9][A-Za-z0-9._-]*)"


@route("GET", r"/api/me")
def r_me(req, m):
    return {"ok": True, "language": config.get("language") or "en"}


# Version de Helmshell et nouvelle version publiée sur GitHub (vérifiée au plus une fois par jour, en cache)
@route("GET", r"/api/version")
def r_version(req, m):
    import helmshell
    from helmshell import updates
    return dict(updates.check(force=req.q("force") == "1"), version=helmshell.__version__,
                repo="https://github.com/MrDDream/Helmshell")


@route("POST", r"/api/logout")
def r_logout(req, m):
    req.extra_headers.append(("Set-Cookie", f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"))
    return {"ok": True}


@route("POST", r"/api/logout-all")
def r_logout_all(req, m):
    """Déconnecte tous les appareils (cookies volés compris) ; celui-ci reste connecté."""
    revoke_sessions(req)
    log_activity(_("Tous les appareils ont été déconnectés (depuis {ip})", ip=req.client_ip()), "login")
    return {"ok": True}


@route("GET", r"/api/overview")
def r_overview(req, m):
    root = projects.root()
    st = system.stats(str(root))
    st["projects_size"] = projects.dir_size_cached()
    return {
        "root": str(root),
        "user": os.environ.get("HOST_USER") or os.environ.get("USER") or "",
        "stats": st,
        "sessions": claude.list_sessions(),
        "repos": claude.list_repo_sessions(),
        "activity": recent_activity(12),
        "deploy": deployer.info(),
    }


def _attach_app(items):
    """Ajoute à chaque projet l'application liée chez le fournisseur de déploiement (ou None)."""
    apps = {}
    if deployer.configured():
        try:
            apps = {a["uuid"]: a for a in deployer.require().apps()}
        except ApiError:
            apps = {}
    for p in items:
        p["app"] = apps.get(p.get("app_id")) if p.get("app_id") else None
    return items


@route("GET", r"/api/projects")
def r_projects(req, m):
    return _attach_app(projects.list_projects())


@route("POST", r"/api/projects")
def r_create(req, m):
    return projects.create_project(req.json())


@route("POST", r"/api/folders")
def r_folder(req, m):
    return projects.create_folder(req.json().get("name", ""))


@route("GET", r"/api/projects/" + S)
def r_project(req, m):
    info = projects.details(m["slug"])
    _attach_app([info])
    # suggestion de liaison d'après l'URL du dépôt
    if deployer.configured() and not info.get("app_id") and info.get("remote"):
        norm = lambda u: re.sub(r"(\.git)?/?$", "", re.sub(r"^(https?://|git@)", "", u).replace(":", "/"))
        try:
            for a in deployer.require().apps():
                if a["repo"] and norm(a["repo"]).endswith(norm(info["remote"]).split("/", 1)[-1]):
                    info["app_suggestion"] = a
                    break
        except ApiError:
            pass
    return info


@route("DELETE", r"/api/projects/" + S)
def r_project_delete(req, m):
    if req.json().get("confirm") != m["slug"]:
        raise ApiError(_("Confirmation manquante"))
    return projects.delete_project(m["slug"])


@route("PATCH", r"/api/projects/" + S)
def r_project_patch(req, m):
    projects.project_dir(m["slug"])
    data = req.json()
    vals = {k: data[k] for k in ("name", "description") if k in data}
    if "app_id" in data:
        if not deployer.meta_key():
            raise ApiError(_("Aucun outil de déploiement n'est configuré"))
        vals[deployer.meta_key()] = str(data["app_id"] or "") or None
    if "tags" in data:
        # null ou liste vide : retour à la détection automatique
        vals["tags"] = [str(t).strip()[:30] for t in (data["tags"] or []) if str(t).strip()][:12] or None
    if "platforms" in data:
        if data["platforms"] is None:
            vals["platforms"] = None
        else:
            bad = [x for x in data["platforms"] if x not in projects.PLATFORM_ORDER]
            if bad:
                raise ApiError(_("Plateforme inconnue : {names}", names=", ".join(map(str, bad))))
            vals["platforms"] = sorted(set(data["platforms"]), key=projects.PLATFORM_ORDER.index)
    config.set_project_meta(m["slug"], **vals)
    return {"ok": True}


@route("GET", r"/api/projects/" + S + r"/icon")
def r_icon(req, m):
    projects.project_dir(m["slug"])
    f = projects.icon_file(m["slug"])
    if not f:
        raise ApiError(_("Pas d'icône"), 404)
    ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    if ctype not in SAFE_INLINE:
        ctype = "application/octet-stream"
    data = f.read_bytes()
    req.send_response(200)
    req.send_header("Content-Type", ctype)
    req.send_header("Content-Length", str(len(data)))
    req.send_header("Cache-Control", "private, max-age=604800")
    req.send_header("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'")
    req.send_header("X-Content-Type-Options", "nosniff")
    req.end_headers()
    req.wfile.write(data)
    return Ellipsis


@route("PUT", r"/api/projects/" + S + r"/icon")
def r_icon_upload(req, m):
    length = req.body_length()
    if length > projects.ICON_MAX:
        raise ApiError(_("Image trop grosse (2 Mo max)"), 413)
    data = req.rfile.read(length) if length else b""
    name = req.q("name") or ""
    return {"icon": projects.set_icon(m["slug"], data, name.rsplit(".", 1)[-1] if "." in name else "")}


@route("POST", r"/api/projects/" + S + r"/icon")
def r_icon_from_repo(req, m):
    return {"icon": projects.set_icon_from_repo(m["slug"], req.json().get("path", ""))}


@route("DELETE", r"/api/projects/" + S + r"/icon")
def r_icon_delete(req, m):
    projects.project_dir(m["slug"])
    projects.remove_icon(m["slug"])
    return {"icon": 0}


@route("GET", r"/api/projects/" + S + r"/icon/candidates")
def r_icon_candidates(req, m):
    return projects.icon_candidates(m["slug"])


@route("GET", r"/api/projects/" + S + r"/tree")
def r_tree(req, m):
    return projects.tree(m["slug"], req.q("path"))


@route("GET", r"/api/projects/" + S + r"/file")
def r_file(req, m):
    return projects.read_file(m["slug"], req.q("path"))


@route("PUT", r"/api/projects/" + S + r"/file")
def r_file_put(req, m):
    projects.write_file(m["slug"], req.q("path"), req.json().get("content", ""))
    return {"ok": True}


@route("POST", r"/api/projects/" + S + r"/mkdir")
def r_mkdir(req, m):
    projects.mkdir(m["slug"], req.json().get("path", ""))
    return {"ok": True}


@route("POST", r"/api/projects/" + S + r"/newfile")
def r_newfile(req, m):
    projects.newfile(m["slug"], req.json().get("path", ""))
    return {"ok": True}


@route("POST", r"/api/projects/" + S + r"/rename")
def r_rename(req, m):
    d = req.json()
    projects.rename(m["slug"], d.get("from", ""), d.get("to", ""))
    return {"ok": True}


@route("POST", r"/api/projects/" + S + r"/delete")
def r_delete(req, m):
    return projects.delete(m["slug"], req.json().get("path", ""))


@route("GET", r"/api/projects/" + S + r"/files")
def r_files(req, m):
    return projects.all_files(m["slug"])


@route("GET", r"/api/projects/" + S + r"/search")
def r_search(req, m):
    return projects.search(m["slug"], req.q("q"), req.q("regex") == "1", req.q("case") == "1")


@route("GET", r"/api/projects/" + S + r"/commands")
def r_commands(req, m):
    return projects.commands(m["slug"])


@route("PUT", r"/api/projects/" + S + r"/commands")
def r_commands_put(req, m):
    return projects.set_commands(m["slug"], req.json().get("commands"))


@route("POST", r"/api/projects/" + S + r"/run")
def r_run(req, m):
    projects.run_command(m["slug"], req.json().get("cmd", ""))
    return {"ok": True}


# Corbeille
@route("GET", r"/api/trash")
def r_trash(req, m):
    return projects.list_trash()


@route("POST", r"/api/trash/(?P<id>[\w-]+)/restore")
def r_trash_restore(req, m):
    return projects.restore_trash(m["id"])


@route("DELETE", r"/api/trash/(?P<id>[\w-]+)")
def r_trash_purge(req, m):
    projects._trash_item(m["id"])
    projects.purge_trash(m["id"])
    return {"ok": True}


@route("DELETE", r"/api/trash")
def r_trash_empty(req, m):
    projects.purge_trash()
    log_activity(_("Corbeille vidée"), "file")
    return {"ok": True}


@route("PUT", r"/api/projects/" + S + r"/upload")
def r_upload(req, m):
    length = req.body_length()
    if length > MAX_UPLOAD:
        raise ApiError(_("Fichier trop gros (512 Mo max)"), 413)
    data = req.rfile.read(length) if length else b""
    projects.write_bytes(m["slug"], req.q("path"), data)
    return {"ok": True}


@route("GET", r"/api/projects/" + S + r"/download")
def r_download(req, m):
    base = projects.project_dir(m["slug"])
    f = projects.safe_path(base, req.q("path"))
    if not f.is_file():
        raise ApiError(_("Fichier introuvable"), 404)
    ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    inline = (ctype in SAFE_INLINE or ctype == PDF) and req.q("inline") == "1"
    req.send_response(200)
    req.send_header("Content-Type", ctype if inline else "application/octet-stream")
    req.send_header("Content-Length", str(f.stat().st_size))
    disp = "inline" if inline else "attachment"
    req.send_header("Content-Disposition", f"{disp}; filename*=UTF-8''{urllib.parse.quote(f.name)}")
    if not (inline and ctype == PDF):
        req.send_header("Content-Security-Policy", "sandbox; default-src 'none'")
    req.send_header("X-Content-Type-Options", "nosniff")
    req.end_headers()
    with open(f, "rb") as fh:
        while chunk := fh.read(65536):
            req.wfile.write(chunk)
    return Ellipsis


# Git
@route("GET", r"/api/projects/" + S + r"/git")
def r_git(req, m):
    return projects.git_info(m["slug"])


@route("GET", r"/api/projects/" + S + r"/git/diff")
def r_git_diff(req, m):
    return {"diff": projects.git_diff(m["slug"], req.q("path"))}


@route("POST", r"/api/projects/" + S + r"/git/commit")
def r_git_commit(req, m):
    d = req.json()
    paths = d.get("paths")
    return {"output": projects.git_commit(m["slug"], d.get("message", ""), bool(d.get("push")),
                                          paths if isinstance(paths, list) else None)}


@route("GET", r"/api/projects/" + S + r"/git/branches")
def r_git_branches(req, m):
    return projects.git_branches(m["slug"])


@route("POST", r"/api/projects/" + S + r"/git/checkout")
def r_git_checkout(req, m):
    d = req.json()
    return {"output": projects.git_checkout(m["slug"], d.get("branch", ""), bool(d.get("create")))}


@route("GET", r"/api/projects/" + S + r"/git/log")
def r_git_log(req, m):
    return projects.git_log(m["slug"], int(req.q("skip") or 0), int(req.q("n") or 30))


@route("GET", r"/api/projects/" + S + r"/git/show")
def r_git_show(req, m):
    return projects.git_show(m["slug"], req.q("rev"))


@route("POST", r"/api/projects/" + S + r"/git/init")
def r_git_init(req, m):
    return {"output": projects.git_init(m["slug"])}


@route("POST", r"/api/projects/" + S + r"/git/fetch")
def r_git_fetch(req, m):
    return projects.git_fetch(m["slug"], force=bool(req.json().get("force")))


@route("POST", r"/api/projects/" + S + r"/git/remote")
def r_git_remote(req, m):
    return projects.git_set_remote(m["slug"], req.json().get("url", ""))


@route("POST", r"/api/projects/" + S + r"/git/pull")
def r_git_pull(req, m):
    return {"output": projects.git_pull(m["slug"])}


@route("POST", r"/api/projects/" + S + r"/git/suggest")
def r_git_suggest(req, m):
    return {"message": projects.suggest_commit(m["slug"])}


# Claude
@route("GET", r"/api/sessions")
def r_sessions(req, m):
    return claude.list_sessions()


@route("GET", r"/api/repo-sessions")
def r_repo_sessions(req, m):
    return claude.list_repo_sessions(with_preview=req.q("preview") == "1", agent=req.q("agent") or None)


def _agent(req):
    """Agent de la session du dépôt : ?agent=claude (défaut) ou ?agent=codex."""
    return agents.get(req.q("agent") or "claude").id


# Agents de code (Claude Code, Codex) : installés ?, modes, agent par défaut
@route("GET", r"/api/agents")
def r_agents(req, m):
    return agents.public_info()


@route("GET", r"/api/projects/" + S + r"/agents/history")
def r_agent_history(req, m):
    agent = _agent(req)
    if agent == "codex":
        return codex.history(projects.project_dir(m["slug"]), min(int(req.q("limit") or 8), 60))
    return [dict(c, agent="claude") for c in projects.transcripts(m["slug"], min(int(req.q("limit") or 8), 60))]


@route("GET", r"/api/projects/" + S + r"/agents/history/(?P<sid>[\w-]+)")
def r_agent_transcript(req, m):
    if _agent(req) == "codex":
        return codex.transcript(projects.project_dir(m["slug"]), m["sid"])
    return dict(projects.transcript(m["slug"], m["sid"]), agent="claude")


@route("GET", r"/api/claude/usage")
def r_claude_usage(req, m):
    return usage.summary()


@route("GET", r"/api/claude/history")
def r_history_all(req, m):
    return projects.recent_conversations(min(int(req.q("limit") or 20), 60))


@route("POST", r"/api/projects/" + S + r"/claude/repo/send")
def r_repo_send(req, m):
    d = req.json()
    return claude.repo_send(m["slug"], d.get("text"), d.get("key"), req.q("branch") or None, _agent(req))


@route("POST", r"/api/projects/" + S + r"/claude/repo/resume")
def r_repo_resume(req, m):
    return claude.repo_resume(m["slug"], req.json().get("id", ""), _agent(req))


@route("GET", r"/api/projects/" + S + r"/claude")
def r_claude(req, m):
    projects.project_dir(m["slug"])
    return claude.state(m["slug"])


@route("GET", r"/api/projects/" + S + r"/claude/history")
def r_claude_history(req, m):
    return projects.transcripts(m["slug"])


@route("GET", r"/api/projects/" + S + r"/claude/history/(?P<sid>[\w-]+)")
def r_claude_transcript(req, m):
    return projects.transcript(m["slug"], m["sid"])


@route("POST", r"/api/projects/" + S + r"/claude/start")
def r_claude_start(req, m):
    d = req.json()
    return claude.start(m["slug"], d.get("mode") or config.get("default_mode"), bool(d.get("continue")),
                        d.get("spawn") or None)


# Tâches en arrière-plan
@route("GET", r"/api/tasks")
def r_tasks(req, m):
    return tasks.list_tasks(req.q("project") or None, int(req.q("limit") or 20))


@route("POST", r"/api/projects/" + S + r"/tasks")
def r_task_start(req, m):
    d = req.json()
    agent = agents.get(d.get("agent") or "claude").id  # sans agent : Claude, comme avant
    return tasks.start(m["slug"], d.get("prompt", ""), d.get("mode") or agents.get(agent).default_mode(),
                       d.get("kind") or "", bool(d.get("trust")), agent)


@route("GET", r"/api/tasks/(?P<id>[\w-]+)")
def r_task(req, m):
    return tasks.state(m["id"], full=True)


@route("POST", r"/api/tasks/(?P<id>[\w-]+)/retry")
def r_task_retry(req, m):
    return tasks.retry(m["id"], bool(req.json().get("trust")))


@route("DELETE", r"/api/tasks")
def r_tasks_clear(req, m):
    if req.q("done") != "1":
        raise ApiError(_("Précise ?done=1"))
    return {"deleted": tasks.clear_finished()}


@route("POST", r"/api/tasks/(?P<id>[\w-]+)/stop")
def r_task_stop(req, m):
    tasks.stop(m["id"])
    return {"ok": True}


@route("DELETE", r"/api/tasks/(?P<id>[\w-]+)")
def r_task_delete(req, m):
    tasks.delete(m["id"])
    return {"ok": True}


# Direct : état des sessions, tâches et santé du serveur
@route("GET", r"/api/events")
def r_events(req, m):
    req.send_response(200)
    req.send_header("Content-Type", "text/event-stream")
    req.send_header("Cache-Control", "no-cache")
    req.send_header("X-Accel-Buffering", "no")
    req.send_header("Connection", "close")
    req.end_headers()
    req.close_connection = True
    version = None
    try:
        while True:
            snap = events.wait(version, 15)
            if snap["v"] != version:
                version = snap["v"]
                req.wfile.write(f"data: {json.dumps(snap, ensure_ascii=False)}\n\n".encode())
            else:
                req.wfile.write(b": ping\n\n")
            req.wfile.flush()
    except (BrokenPipeError, ConnectionResetError, OSError):
        pass
    return Ellipsis


@route("GET", r"/api/metrics")
def r_metrics(req, m):
    try:
        hours = int(req.q("hours") or 24)
    except ValueError:
        raise ApiError(_("Période invalide"))
    return system.metrics(hours)


@route("POST", r"/api/projects/" + S + r"/claude/stop")
def r_claude_stop(req, m):
    claude.stop(m["slug"])
    return {"ok": True}


@route("POST", r"/api/projects/" + S + r"/claude/send")
def r_claude_send(req, m):
    """Réponse Oui / Non à la question que Claude pose (sessions en arrière-plan) : rien d'autre."""
    d = req.json()
    text = d.get("text")
    if text is not None:
        if text not in ("y", "n") or not isinstance(d.get("question"), str):
            raise ApiError(_("Réponse attendue : Oui ou Non, à une question précise"))
        st = claude.state(m["slug"], light=True)  # la question doit encore être posée
        if st.get("phase") != "question" or st.get("question") != d["question"]:
            raise ApiError(_("Cette question n'attend plus de réponse"), 409)
    return claude.send(m["slug"], text, d.get("key"))


# Terminal
@route("POST", r"/api/term")
def r_term_open(req, m):
    d = req.json()
    target = d.get("target", "server")
    name = d.get("name")
    if target == "new":
        name, target = terminal.new_session(d.get("slug") or None), "session"
    agent = agents.get(d.get("agent") or "claude").id
    t = terminal.open_term(target, d.get("slug"), d.get("cols"), d.get("rows"), name, d.get("branch") or None, agent)
    return {"id": t.id, "title": t.title, "name": name or t.title}


@route("GET", r"/api/terminals")
def r_terminals(req, m):
    return terminal.list_sessions()


@route("DELETE", r"/api/terminals/(?P<name>[\w.@-]+)")
def r_terminal_kill(req, m):
    terminal.kill_session(m["name"])
    return {"ok": True}


# Session interactive du dépôt (tmux « nom-du-dossier » avec Claude dedans).
# ?branch=x : celle de la copie de travail de la branche x (tmux « nom-du-dossier@x »).
@route("GET", r"/api/projects/" + S + r"/claude/repo")
def r_repo_state(req, m):
    return claude.repo_state(m["slug"], req.q("branch") or None, _agent(req))


@route("POST", r"/api/projects/" + S + r"/claude/repo/open")
def r_repo_open(req, m):
    d = req.json()
    return claude.repo_open(m["slug"], d.get("mode") or None, bool(d.get("continue")), bool(d.get("rc")),
                            req.q("branch") or None, _agent(req))


@route("POST", r"/api/projects/" + S + r"/claude/repo/(?P<act>rc|restart|kill)")
def r_repo_act(req, m):
    branch = req.q("branch") or None
    agent = _agent(req)
    if m["act"] == "rc":
        return claude.repo_remote_control(m["slug"], branch, agent)
    if m["act"] == "restart":
        return claude.repo_restart(m["slug"], branch, agent)
    claude.repo_kill(m["slug"], branch, agent=agent)
    return claude.repo_state(m["slug"], branch, agent)


# Branches en parallèle : une copie de travail par branche (~/projets/.branches/<projet>/<branche>)
@route("GET", r"/api/projects/" + S + r"/branches")
def r_copies(req, m):
    return branches.list_copies(m["slug"])


@route("POST", r"/api/projects/" + S + r"/branches")
def r_copy_create(req, m):
    d = req.json()
    return branches.create(m["slug"], d.get("branch", ""), d.get("base") or None)


@route("POST", r"/api/projects/" + S + r"/branches/merge")
def r_copy_merge(req, m):
    return branches.merge(m["slug"], req.json().get("branch", ""))


@route("POST", r"/api/projects/" + S + r"/branches/remove")
def r_copy_remove(req, m):
    d = req.json()
    return branches.remove(m["slug"], d.get("branch", ""), bool(d.get("delete_branch")), bool(d.get("force")))


@route("POST", r"/api/term/(?P<id>[\w-]+)/input")
def r_term_input(req, m):
    terminal.get(m["id"]).write(req.json().get("data", ""))
    return {"ok": True}


@route("POST", r"/api/term/(?P<id>[\w-]+)/resize")
def r_term_resize(req, m):
    d = req.json()
    terminal.get(m["id"]).resize(d.get("cols"), d.get("rows"))
    return {"ok": True}


@route("DELETE", r"/api/term/(?P<id>[\w-]+)")
def r_term_close(req, m):
    terminal.close(m["id"])
    return {"ok": True}


@route("GET", r"/api/term/(?P<id>[\w-]+)/stream")
def r_term_stream(req, m):
    t = terminal.get(m["id"])
    req.send_response(200)
    req.send_header("Content-Type", "text/event-stream")
    req.send_header("Cache-Control", "no-cache")
    req.send_header("X-Accel-Buffering", "no")
    req.send_header("Connection", "close")
    req.end_headers()
    req.close_connection = True
    last = req.headers.get("Last-Event-ID")
    pos = int(last) if last and last.isdigit() else None
    t.clients += 1
    try:
        while True:
            data, pos, closed = t.read_from(pos)
            if data:
                req.wfile.write(f"id: {pos}\ndata: {base64.b64encode(data).decode()}\n\n".encode())
            else:
                req.wfile.write(b": ping\n\n")
            if closed:
                req.wfile.write(b"event: exit\ndata: fin\n\n")
                req.wfile.flush()
                break
            req.wfile.flush()
    except (BrokenPipeError, ConnectionResetError, OSError):
        pass
    finally:
        t.clients -= 1
        t.last_client = time.time()
    return Ellipsis


# Déploiement (Coolify ou Dokploy, selon Paramètres)
@route("GET", r"/api/deploy/apps")
def r_cf_apps(req, m):
    if req.q("fresh"):
        deployer.require().invalidate()
    apps = deployer.require().apps()
    links = {deployer.app_id(meta): slug for slug, meta in config.load()["projects"].items()
             if deployer.app_id(meta)}
    for a in apps:
        a["project"] = links.get(a["uuid"])
    return apps


@route("GET", r"/api/deploy/apps/(?P<uuid>[\w-]+)/deployments")
def r_cf_app_deps(req, m):
    return deployer.require().app_deployments(m["uuid"])


@route("POST", r"/api/deploy/deploy")
def r_cf_deploy(req, m):
    d = req.json()
    return deployer.require().deploy(d.get("uuid", ""), bool(d.get("force")))


@route("DELETE", r"/api/deploy/apps/(?P<uuid>[\w-]+)")
def r_cf_app_delete(req, m):
    if req.json().get("confirm") != m["uuid"]:
        raise ApiError(_("Confirmation manquante"))
    return deployer.require().delete_app(m["uuid"])


@route("POST", r"/api/deploy/apps/(?P<uuid>[\w-]+)/(?P<act>start|stop|restart)")
def r_cf_app_action(req, m):
    return deployer.require().app_action(m["uuid"], m["act"])


@route("GET", r"/api/deploy/deployments")
def r_cf_deps(req, m):
    return deployer.require().deployments()


@route("POST", r"/api/deploy/apps/(?P<uuid>[\w-]+)/domains")
def r_cf_domains(req, m):
    d = req.json()
    deployer.require().set_domains(m["uuid"], d.get("domains", ""))
    if d.get("redeploy"):
        deployer.require().deploy(m["uuid"])
    return {"ok": True}


@route("GET", r"/api/deploy/apps/(?P<uuid>[\w-]+)/logs")
def r_cf_logs(req, m):
    return {"logs": deployer.require().logs(m["uuid"], int(req.q("lines") or 200))}


@route("GET", r"/api/deploy/apps/(?P<uuid>[\w-]+)/envs")
def r_cf_envs(req, m):
    return deployer.require().envs(m["uuid"])


@route("POST", r"/api/deploy/apps/(?P<uuid>[\w-]+)/envs")
def r_cf_env_set(req, m):
    d = req.json()
    deployer.require().set_env(m["uuid"], d.get("key", ""), str(d.get("value", "")), bool(d.get("create")))
    return {"ok": True}


@route("DELETE", r"/api/deploy/apps/(?P<uuid>[\w-]+)/envs/(?P<env>[\w-]+)")
def r_cf_env_del(req, m):
    deployer.require().delete_env(m["uuid"], m["env"])
    return {"ok": True}


@route("GET", r"/api/deploy/apps/(?P<uuid>[\w-]+)/rollback")
def r_cf_rollback_list(req, m):
    return deployer.require().rollback_images(m["uuid"])


@route("POST", r"/api/deploy/apps/(?P<uuid>[\w-]+)/rollback")
def r_cf_rollback(req, m):
    return deployer.require().rollback(m["uuid"], req.json().get("commit", ""))


@route("GET", r"/api/deploy/resources")
def r_cf_resources(req, m):
    if req.q("fresh"):
        deployer.require().invalidate()
    return deployer.require().resources()


@route("POST", r"/api/notify/test")
def r_notify_test(req, m):
    err = notify.send("Helmshell", _("Les notifications fonctionnent."), click=notify.public_url(), wait=True)
    if err:
        raise ApiError(err, 502)
    return {"ok": True}


# Comptes Git liés (GitHub, GitLab, Gitea, Forgejo, Codeberg)
@route("GET", r"/api/forges")
def r_forges(req, m):
    return forges.list_public()


@route("POST", r"/api/forges")
def r_forge_add(req, m):
    d = req.json()
    f = forges.add(d.get("kind", ""), d.get("url", ""), d.get("token", ""), d.get("access") or "write")
    log_activity(_("Compte {forge} « {user} » lié", forge=forges.KINDS[f["kind"]][2], user=f["user"]), "git")
    return f


@route("DELETE", r"/api/forges/(?P<id>[0-9a-f]{8})")
def r_forge_del(req, m):
    forges.remove(m["id"])
    return {"ok": True}


@route("GET", r"/api/forges/(?P<id>[0-9a-f]{8})/repos")
def r_forge_repos(req, m):
    return forges.repos(m["id"], fresh=req.q("fresh") == "1")


# Double authentification (TOTP)
@route("GET", r"/api/2fa")
def r_2fa(req, m):
    return totp.status()


@route("POST", r"/api/2fa/setup")
def r_2fa_setup(req, m):
    return totp.setup()


@route("POST", r"/api/2fa/enable")
def r_2fa_enable(req, m):
    codes = totp.enable(req.json().get("code", ""))
    revoke_sessions(req)  # les sessions ouvertes sans le second facteur ne valent plus
    log_activity(_("Double authentification activée"), "login")
    return {"recovery": codes}


@route("POST", r"/api/2fa/recovery")
def r_2fa_recovery(req, m):
    return {"recovery": totp.regenerate_recovery(req.json().get("code", ""))}


@route("POST", r"/api/2fa/disable")
def r_2fa_disable(req, m):
    d = req.json()
    if not config.check_password(d.get("password", "")):
        raise ApiError(_("Mot de passe incorrect"), 403)
    if not totp.verify(d.get("code", "")):
        raise ApiError(_("Code incorrect ou déjà utilisé"), 403)
    totp.disable()
    revoke_sessions(req)
    log_activity(_("Double authentification désactivée"), "login")
    return totp.status()


@route("GET", r"/api/deploy/meta")
def r_cf_meta(req, m):
    # ?provider=… : tester un outil avant de l'avoir choisi
    return (deployer.MODULES.get(req.q("provider")) or deployer.require()).meta()


# Activité et paramètres
@route("GET", r"/api/activity")
def r_activity(req, m):
    return recent_activity(int(req.q("limit") or 30), req.q("project") or None)


SETTING_KEYS = ("projects_root", "coolify_url", "coolify_public_url", "coolify_project_uuid",
                "coolify_server_uuid", "coolify_environment", "domain_suffix", "default_mode", "claude_bin",
                "dokploy_url", "dokploy_public_url", "dokploy_project_id", "dokploy_environment_id",
                "dokploy_server_id",
                "ntfy_url", "public_url", "notify_service", "gotify_url",
                "default_agent", "codex_bin", "codex_default_mode", "language")


@route("GET", r"/api/settings")
def r_settings(req, m):
    out = {k: config.get(k) for k in SETTING_KEYS}
    out["coolify_token_set"] = bool(config.get("coolify_token"))
    out["dokploy_token_set"] = bool(config.get("dokploy_token"))
    out["deploy_provider"] = deployer.provider_id()
    out["ntfy_token_set"] = bool(config.get("ntfy_token"))
    out["gotify_token_set"] = bool(config.get("gotify_token"))
    out["discord_webhook_set"] = bool(config.get("discord_webhook"))
    out["notify_service"] = notify.service() or "off"
    out["password_from_env"] = bool(os.environ.get("HELMSHELL_PASSWORD"))
    out["totp"] = totp.status()
    out["notify_done"] = config.get("notify_done") is not False
    out["usage_every"] = usage.every()
    out["modes"] = sorted(claude.MODES)
    out["codex_default_mode"] = codex.default_mode()
    out["codex_modes"] = list(codex.MODE_ORDER)
    out["language"] = config.get("language") or "en"
    out["update_check"] = config.get("update_check") is not False
    out["agents"] = agents.public_info()
    out["access"] = config.get("access") or {}
    for k in ("oidc_issuer", "oidc_client_id", "oidc_allowed_emails", "oidc_group", "oidc_label"):
        out[k] = config.get(k) or ""
    out["oidc_client_secret_set"] = bool(config.get("oidc_client_secret"))
    out["oidc"] = oidc.status()
    out["oidc_redirect"] = req.oidc_redirect()
    out["access_info"] = access.summary()
    return out


@route("GET", r"/api/access/whoami")
def r_whoami(req, m):
    """Ce que voit le serveur pour cette requête (aide à régler l'accès par domaine)."""
    ev = req.access
    cfg = access.current()
    return {"direct": req.client_address[0], "forwarded_for": req.headers.get("X-Forwarded-For") or "",
            "real_ip": req.headers.get("X-Real-Ip") or "", "host": req.headers.get("Host") or "",
            "proto": req.headers.get("X-Forwarded-Proto") or "", "ip": ev["ip"], "rule": ev["rule"],
            "via_proxy": ev["via_proxy"],
            "source": "settings" if cfg else ("env" if access.ENV_NETS else "open")}


@route("PUT", r"/api/settings")
def r_settings_put(req, m):
    d = req.json()
    vals = {k: str(d[k]).strip() for k in SETTING_KEYS if k in d}
    if "default_mode" in vals and vals["default_mode"] not in claude.MODES:
        raise ApiError(_("Mode inconnu"))
    if "default_agent" in vals and vals["default_agent"] not in ("", *agents.AGENTS):
        raise ApiError(_("Agent inconnu"))
    if "codex_default_mode" in vals and vals["codex_default_mode"] not in codex.MODES:
        raise ApiError(_("Mode inconnu"))
    if "language" in vals and vals["language"] not in config.LANGUAGES:
        raise ApiError(_("Langue inconnue"))
    if "update_check" in d:
        vals["update_check"] = bool(d["update_check"])
    if "projects_root" in vals and vals["projects_root"]:
        root = Path(vals["projects_root"]).expanduser()
        try:
            root.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise ApiError(_("Impossible d'utiliser {path} : {error}", path=root, error=e.strerror)) from None
        if not os.access(root, os.W_OK):
            raise ApiError(_("Pas de droit d'écriture sur {path}", path=root))
    if d.get("coolify_token"):
        vals["coolify_token"] = d["coolify_token"].strip()
    if d.get("clear_coolify_token"):
        vals["coolify_token"] = ""
    if d.get("dokploy_token"):
        vals["dokploy_token"] = str(d["dokploy_token"]).strip()
    if d.get("clear_dokploy_token"):
        vals["dokploy_token"] = ""
    if "deploy_provider" in d:
        if d["deploy_provider"] not in ("", *deployer.MODULES):
            raise ApiError(_("Outil de déploiement inconnu"))
        vals["deploy_provider"] = d["deploy_provider"]
    for k in ("coolify_url", "dokploy_url", "coolify_public_url", "dokploy_public_url"):
        if vals.get(k) and not re.match(r"^https?://[^\s]+$", vals[k]):
            raise ApiError(_("Adresse attendue sous la forme http(s)://…"))
    if d.get("ntfy_token"):
        vals["ntfy_token"] = d["ntfy_token"].strip()
    if d.get("clear_ntfy_token"):
        vals["ntfy_token"] = ""
    for key in ("gotify_token", "discord_webhook"):
        if d.get(key):
            vals[key] = d[key].strip()
        if d.get("clear_" + key):
            vals[key] = ""
    if "notify_done" in d:
        vals["notify_done"] = bool(d["notify_done"])
    if "usage_every" in d:
        try:
            vals["usage_every"] = int(d["usage_every"])
        except (TypeError, ValueError):
            raise ApiError(_("Délai d'actualisation invalide")) from None
        if vals["usage_every"] not in usage.USAGE_EVERY:
            raise ApiError(_("Délai d'actualisation invalide"))
    if "notify_service" in vals and vals["notify_service"] not in (*notify.SERVICES, "off"):
        raise ApiError(_("Service de notification inconnu"))
    try:
        if vals.get("ntfy_url"):
            notify._split(vals["ntfy_url"])
        if vals.get("gotify_url"):
            vals["gotify_url"] = notify.check_gotify(vals["gotify_url"])
        if vals.get("discord_webhook"):
            notify.check_discord(vals["discord_webhook"])
    except ValueError as e:
        raise ApiError(str(e)) from None
    if vals.get("public_url") and not re.match(r"^https?://[^\s/]+(:\d+)?/?$", vals["public_url"]):
        raise ApiError(_("Adresse de Helmshell attendue sous la forme http://192.168.1.10:8787"))
    revoke_after = False
    oidc_keys = ("oidc_issuer", "oidc_client_id", "oidc_allowed_emails", "oidc_group", "oidc_label")
    if any(k in d for k in oidc_keys) or d.get("oidc_client_secret") or "oidc_enabled" in d:
        for k in oidc_keys:
            if k in d:
                vals[k] = str(d[k] or "").strip()[:2000]
        if vals.get("oidc_issuer"):
            vals["oidc_issuer"] = oidc.check_issuer(vals["oidc_issuer"])
        if d.get("oidc_client_secret"):
            vals["oidc_client_secret"] = str(d["oidc_client_secret"]).strip()
        if d.get("clear_oidc_client_secret"):
            vals["oidc_client_secret"] = ""
        # Nouveau fournisseur ou nouveau client : il faut refaire un test avant d'imposer l'OIDC
        if any(k in vals and vals[k] != (config.get(k) or "") for k in ("oidc_issuer", "oidc_client_id", "oidc_client_secret")):
            vals["oidc_tested"] = False
            vals["oidc_enabled"] = False
        if "oidc_enabled" in d:
            want = bool(d["oidc_enabled"])
            if want and not (vals.get("oidc_tested", config.get("oidc_tested"))):
                raise ApiError(_("Teste d'abord la connexion OIDC : tant qu'elle n'a pas réussi, le mot de passe reste actif"))
            if want and not ((vals.get("oidc_allowed_emails", config.get("oidc_allowed_emails")) or "").strip()
                             or (vals.get("oidc_group", config.get("oidc_group")) or "").strip()):
                raise ApiError(_("Indique au moins une adresse e-mail ou un groupe autorisé"))
            vals["oidc_enabled"] = want
        if any(k in vals and vals[k] != config.get(k) for k in ("oidc_enabled", "oidc_allowed_emails", "oidc_group",
                                                                  "oidc_issuer", "oidc_client_id")):
            revoke_after = True
    if "access" in d:
        cfg = access.clean(d["access"])
        if access.active(cfg) and os.environ.get("HELMSHELL_ACCESS_RESET") != "1":
            ev = access.evaluate(req.client_address[0], req.headers, cfg)
            if not ev["allowed"]:
                raise ApiError(_("Ce réglage te couperait l'accès (ton adresse vue : {ip}, {rule}). "
                                 "Ajoute ton réseau ou ton IP avant d'enregistrer.", ip=ev["ip"], rule=ev["rule"].lower()))
        vals["access"] = cfg
    config.update(**vals)
    deployer.invalidate()
    if revoke_after:  # qui peut se connecter a changé : les sessions existantes ne valent plus
        revoke_sessions(req)
    if d.get("new_password"):
        if os.environ.get("HELMSHELL_PASSWORD"):
            raise ApiError(_("Le mot de passe est fixé par HELMSHELL_PASSWORD"))
        if not config.check_password(d.get("current_password", "")):
            raise ApiError(_("Mot de passe actuel incorrect"), 403)
        if len(d["new_password"]) < 8:
            raise ApiError(_("8 caractères minimum"))
        config.set_password(d["new_password"])
        req.extra_headers.append(("Set-Cookie", req.cookie_header(make_token())))
    return {"ok": True}


# --- Serveur HTTP ---------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "Helmshell"
    timeout = 30  # socket : une connexion muette (slowloris) libère son thread au bout de 30 s

    def log_message(self, fmt, *args):
        if os.environ.get("HELMSHELL_DEBUG"):
            super().log_message(fmt, *args)

    # utilitaires
    def q(self, key):
        return self._query.get(key, [""])[0]

    def body_length(self):
        """Taille annoncée du corps : entier positif, sinon 400 (un -1 ferait lire la socket jusqu'au bout)."""
        raw = (self.headers.get("Content-Length") or "0").strip()
        if not raw.isdigit():
            self.close_connection = True
            raise ApiError(_("Content-Length invalide"), 400)
        self._body_read = True
        return int(raw)

    def json(self):
        length = self.body_length()
        if not length:
            return {}
        if length > 5_000_000:
            raise ApiError(_("Requête trop grosse"), 413)
        try:
            data = json.loads(self.rfile.read(length))
        except ValueError:
            raise ApiError(_("JSON invalide")) from None
        if not isinstance(data, dict):
            raise ApiError(_("JSON invalide"))
        return data

    def cookie_header(self, token):
        secure = "; Secure" if access.secure_proxy(self.headers, self.access) else ""
        return f"{COOKIE}={token}; Path=/; Max-Age={SESSION_DAYS * 86400}; HttpOnly; SameSite=Strict{secure}"

    def client_ip(self):
        return self.access["ip"]

    def authed(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            exp = token_exp(v) if k == COOKIE else None
            if exp:
                # Session glissante : renouvelée au plus une fois par jour d'utilisation
                if exp - time.time() < (SESSION_DAYS - 1) * 86400 and not any(h == "Set-Cookie" for h, _ in self.extra_headers):
                    self.extra_headers.append(("Set-Cookie", self.cookie_header(make_token())))
                return True
        return False

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in self.extra_headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_manifest(self):
        """Manifeste de l'application web, dans la langue réglée (sans connexion, comme les fichiers statiques)."""
        icon = [{"src": "/icone-192.png", "sizes": "192x192"}]
        manifest = {
            "id": "/",
            "name": "Helmshell",
            "short_name": "Helmshell",
            "description": _("Pilote ton serveur : projets, sessions Claude, Git, terminal et déploiements"),
            "lang": lang(),
            "dir": "ltr",
            "start_url": "/",
            "scope": "/",
            "display": "standalone",
            "orientation": "any",
            "background_color": "#F4FBF8",
            "theme_color": "#F4FBF8",
            "categories": ["developer", "productivity", "utilities"],
            "icons": [
                {"src": "/icone-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                {"src": "/icone-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                {"src": "/icone-masquable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
                {"src": "/logo.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
            ],
            "shortcuts": [
                {"name": _("Projets"), "url": "/#/projets", "icons": icon},
                {"name": _("Sessions Claude"), "short_name": _("Sessions"), "url": "/#/sessions", "icons": icon},
                {"name": _("Terminal"), "url": "/#/terminal", "icons": icon},
                {"name": _("Nouveau projet"), "url": "/#/nouveau", "icons": icon},
            ],
        }
        body = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/manifest+json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def send_static(self, path):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        f = (STATIC / rel).resolve()
        if STATIC not in f.parents or not f.is_file():
            f = STATIC / "index.html"  # routes côté client
        body = f.read_bytes()
        ctype = ("application/manifest+json" if f.suffix == ".webmanifest"
                 else mimetypes.guess_type(f.name)[0] or "application/octet-stream")
        if ctype.startswith("text/") or ctype in ("application/javascript", "text/javascript"):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        # Polices et logos : noms figés, gardés en cache (la police de symboles fait 2 Mo)
        immutable = any(f.is_relative_to(STATIC / d) for d in ("fonts", "logos", "vendor"))  # chemins versionnés
        self.send_header("Cache-Control", "public, max-age=2592000, immutable" if immutable else "no-cache")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    # dispatch
    def handle_any(self, method):
        self.extra_headers = []
        url = urllib.parse.urlsplit(self.path)
        self._query = urllib.parse.parse_qs(url.query)
        path = url.path
        self._body_read = False
        # Corps « chunked » non géré : refusé, et la connexion fermée (pas de désynchronisation possible)
        if self.headers.get("Transfer-Encoding"):
            self.close_connection = True
            body = (_("Transfer-Encoding non pris en charge") + "\n").encode()
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            return
        if not access.host_allowed(self.headers):
            self.close_connection = True
            body = (_("Nom d'hôte non reconnu par Helmshell. Ouvre-le par son adresse IP, par le domaine déclaré "
                      "dans Paramètres › Sécurité, ou ajoute ce nom à HELMSHELL_ALLOWED_HOSTS.") + "\n").encode()
            self.send_response(421)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            return
        try:
            self._dispatch(method, path)
        finally:
            # Corps annoncé mais pas lu (requête refusée avant) : on ferme plutôt que de le lire
            # comme une nouvelle requête sur la même connexion.
            if not self._body_read and (self.headers.get("Content-Length") or "0").strip() not in ("", "0"):
                self.close_connection = True

    def _dispatch(self, method, path):
        self.access = access.evaluate(self.client_address[0], self.headers)
        if not self.access["allowed"]:
            body = (_("Helmshell n'est pas accessible depuis cette adresse.") + "\n").encode()
            self.send_response(403)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        try:
            if path == "/hook/answer" and method == "POST":
                return self.hook_answer()
            if path == "/hook/answer" and method == "GET":
                return self.hook_page()
            if path in ("/auth/oidc/start", "/auth/oidc/callback") and method == "GET":
                return self.oidc_start() if path.endswith("start") else self.oidc_callback()
            if path == "/api/auth-info" and method == "GET":
                return self.send_json({"password": not oidc.only(),
                                       "oidc": {"label": oidc.label()} if oidc.available() else None,
                                       "language": config.get("language") or "en"})
            if path == "/manifest.webmanifest" and method == "GET":
                return self.send_manifest()
            if not path.startswith("/api/"):
                if method != "GET":
                    raise ApiError(_("Méthode non autorisée"), 405)
                return self.send_static(path)
            if path == "/api/login" and method == "POST":
                return self.login()
            if not self.authed():
                raise ApiError(_("Connexion requise"), 401)
            # Protection CSRF : un formulaire d'un autre site ne peut pas poser cet en-tête.
            if method != "GET" and self.headers.get("X-Helmshell") != "1":
                raise ApiError(_("En-tête X-Helmshell manquant"), 403)
            for m_, rx, fn in ROUTES:
                if m_ != method:
                    continue
                match = rx.match(path)
                if match:
                    result = fn(self, match)
                    if result is not Ellipsis:
                        self.send_json(result if result is not None else {"ok": True})
                    return
            raise ApiError(_("Route inconnue"), 404)
        except ApiError as e:
            self.send_json({"error": str(e)}, e.status)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            try:
                self.send_json({"error": _("Erreur interne du serveur (détail dans son journal)")}, 500)
            except OSError:
                pass

    def oidc_redirect(self):
        base = (config.get("public_url") or "").strip().rstrip("/")
        if not base:
            scheme = "https" if access.secure_proxy(self.headers, self.access) else "http"
            base = f"{scheme}://{self.headers.get('Host') or 'localhost:8787'}"
        return base + "/auth/oidc/callback"

    def redirect(self, location, cookies=()):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        for c in cookies:
            self.send_header("Set-Cookie", c)
        self.end_headers()

    def _cookie(self, name):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == name:
                return v
        return ""

    def oidc_start(self):
        test = self.q("test") == "1"
        if test and not self.authed():
            return self.send_page(_("Connexion requise"), _("Connecte-toi à Helmshell avant de tester l'OIDC."), status=401)
        if too_many_failures(self.client_ip()):
            return self.send_page(_("Trop de tentatives"), _("Réessaie dans quelques minutes."), status=429)
        try:
            url, state = oidc.start(self.oidc_redirect(), test=test, ip=self.client_ip())
        except ApiError as e:
            return self.send_page(_("Connexion impossible"), str(e), status=e.status)
        secure = "; Secure" if access.secure_proxy(self.headers, self.access) else ""
        self.redirect(url, [f"helmshell_oidc={state}; Path=/auth/oidc; Max-Age={oidc.STATE_TTL}; HttpOnly; SameSite=Lax{secure}"])

    def oidc_callback(self):
        ip = self.client_ip()
        clear = "helmshell_oidc=; Path=/auth/oidc; Max-Age=0; HttpOnly; SameSite=Lax"
        if too_many_failures(ip):
            return self.send_page(_("Trop de tentatives"), _("Réessaie dans quelques minutes."), status=429)
        if self.q("error"):
            # Message fixe : le texte renvoyé par le fournisseur n'est pas affiché tel quel
            return self.send_page(_("Connexion annulée"), _("Le fournisseur d'identité a refusé ou annulé la connexion."), status=400)
        try:
            res = oidc.finish(self.q("state"), self._cookie("helmshell_oidc"), self.q("code"))
        except ApiError as e:
            note_failure(ip)
            log_login(_("Connexion OIDC refusée depuis {ip} : {error}", ip=ip, error=e))
            return self.send_page(_("Connexion refusée"), str(e), status=e.status)
        if res["test"]:
            config.update(oidc_tested=True)
            log_activity(_("Test OIDC réussi ({email})", email=res["email"]), "login")
            return self.send_page(_("Test réussi"), _("Connecté en tant que {email}.\n"
                                                  "Tu peux fermer cet onglet et revenir aux Paramètres de Helmshell.",
                                                  email=res["email"]))
        log_activity(_("Connexion OIDC de {email} depuis {ip}", email=res["email"], ip=ip), "login")
        log_login(_("Connexion OIDC de {email} depuis {ip}", email=res["email"], ip=ip))
        self.redirect("/#/", [clear, self.cookie_header(make_token())])

    def login(self):
        ip = self.client_ip()
        if oidc.only():
            raise ApiError(_("Connexion par mot de passe désactivée : utilise le bouton de connexion OIDC"), 403)
        data = self.json()
        handle = begin_attempt(ip)
        if not handle:
            raise ApiError(_("Trop de tentatives, réessaie dans quelques minutes"), 429)
        password = data.get("password")
        if not isinstance(password, str) or not config.check_password(password):
            log_login(_("Échec de connexion (mot de passe) depuis {ip}", ip=ip))
            time.sleep(1)
            raise ApiError(_("Mot de passe incorrect"), 403)
        if totp.enabled():
            code = str(data.get("code") or "").strip()
            if not code:  # mot de passe bon : on demande maintenant le code
                end_attempt(handle)
                return self.send_json({"error": _("Code de double authentification requis"), "totp": True}, 401)
            if not totp.verify(code):
                log_login(_("Échec de connexion (code 2FA) depuis {ip}", ip=ip))
                time.sleep(1)
                return self.send_json({"error": _("Code incorrect ou déjà utilisé"), "totp": True}, 403)
        end_attempt(handle)
        self.extra_headers.append(("Set-Cookie", self.cookie_header(make_token())))
        log_activity(_("Connexion à Helmshell depuis {ip}", ip=ip), "login")
        log_login(_("Connexion depuis {ip}", ip=ip))
        self.send_json({"ok": True})

    def send_page(self, title, text, form=False, status=200):
        """Petite page autonome (liens Oui / Non de Gotify et Discord)."""
        e = lambda x: str(x).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
        button = (f'<form method="post"><button>{e(_("Envoyer la réponse"))}</button></form>' if form else "")
        body = f"""<!doctype html><html lang="{lang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Helmshell</title><style>body{{font:16px/1.5 system-ui,sans-serif;background:#F4FBF8;color:#161D1B;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px}}
main{{max-width:460px;background:#fff;border-radius:24px;padding:28px;box-shadow:0 2px 8px #0002}}h1{{font-size:22px;margin:0 0 8px}}
p{{margin:0 0 20px;white-space:pre-wrap}}button{{font:inherit;font-weight:500;border:0;border-radius:20px;padding:10px 24px;background:#006A60;color:#fff;cursor:pointer}}</style></head>
<body><main><h1>{e(title)}</h1><p>{e(text)}</p>{button}</main></body></html>""".encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def hook_page(self):
        """Ouvrir un lien Oui / Non (Gotify, Discord) n'envoie rien : la page demande de confirmer."""
        data = notify.read_token(self.q("t"))
        if not data or data.get("v") not in ("y", "n"):
            return self.send_page(_("Lien expiré"), _("Ce lien n'est plus valable (1 h). Réponds depuis Helmshell."), status=403)
        meta = config.project_meta(data.get("slug", ""))
        st = claude.state(data.get("slug", ""), light=True) if projects.SLUG_RE.match(data.get("slug", "")) else {}
        if st.get("phase") != "question" or events.question_hash(st.get("question")) != data.get("q"):
            return self.send_page(_("Plus de question"), _("Claude n'attend plus cette réponse."), status=409)
        answer = _("Oui") if data["v"] == "y" else _("Non")
        self.send_page(_("Répondre « {answer} » à Claude", answer=answer), f"{meta.get('name') or data['slug']}\n{st.get('question')}", form=True)

    def hook_answer(self):
        """Réponse Oui/Non envoyée depuis une notification (bouton ntfy, ou page de confirmation)."""
        if (self.headers.get("Content-Type") or "").startswith("application/x-www-form-urlencoded"):
            try:
                self._hook_answer()
            except ApiError as err:
                return self.send_page(_("Réponse non envoyée"), str(err), status=err.status)
            return self.send_page(_("Réponse envoyée"), _("Claude a reçu ta réponse. Tu peux fermer cette page."))
        self._hook_answer()
        self.send_json({"ok": True})

    def _hook_answer(self):
        data = notify.read_token(self.q("t"))
        if not data or data.get("v") not in ("y", "n"):
            raise ApiError(_("Lien expiré ou invalide"), 403)
        st = claude.state(data.get("slug", ""), light=True) if projects.SLUG_RE.match(data.get("slug", "")) else {}
        if (st.get("phase") != "question" or events.question_hash(st.get("question")) != data.get("q")
                or st.get("started") != data.get("st")):
            raise ApiError(_("Cette question n'attend plus de réponse"), 409)
        if not notify.consume(data):
            raise ApiError(_("Ce lien a déjà servi"), 409)
        claude.send(data["slug"], data["v"], "Enter")
        log_activity(_("Réponse « Oui » envoyée depuis une notification") if data["v"] == "y"
                     else _("Réponse « Non » envoyée depuis une notification"), "claude", data["slug"])

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def do_PUT(self):
        self.handle_any("PUT")

    def do_PATCH(self):
        self.handle_any("PATCH")

    def do_DELETE(self):
        self.handle_any("DELETE")


MAX_CONNECTIONS = 256


class Server(ThreadingHTTPServer):
    """Un thread par connexion, mais pas plus de MAX_CONNECTIONS à la fois (les suivantes sont fermées)."""
    daemon_threads = True
    allow_reuse_address = True
    _slots = threading.BoundedSemaphore(MAX_CONNECTIONS)

    def process_request(self, request, client_address):
        if not self._slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


def main():
    host = os.environ.get("HELMSHELL_HOST", "0.0.0.0")
    port = int(os.environ.get("HELMSHELL_PORT", "8787"))
    created = config.ensure_initialized()
    projects.root()
    print(_("Helmshell écoute sur http://{host}:{port}  ·  projets : {root}", host=host, port=port,
            root=config.get("projects_root")), flush=True)
    if os.environ.get("HELMSHELL_ACCESS_RESET") == "1":
        print(_("HELMSHELL_ACCESS_RESET=1 : le réglage d'accès réseau est ignoré"), flush=True)
    elif access.current():
        print(_("Accès limité par le réglage « Accès réseau » (Paramètres › Sécurité)"), flush=True)
    elif access.ENV_NETS:
        print(_("Accès limité à : {networks}", networks=", ".join(map(str, access.ENV_NETS))), flush=True)
    if os.environ.get("HELMSHELL_TMUX_SOCKET"):
        print(_("tmux de l'hôte : {socket}", socket=os.environ["HELMSHELL_TMUX_SOCKET"]), flush=True)
    if created:  # jamais en clair dans les journaux (Docker, Coolify) : seulement le fichier, lisible par toi seul
        print(_("Mot de passe initial écrit dans {path} (supprimé dès que tu changes le mot de passe)",
                path=config.DATA_DIR / "mot-de-passe-initial.txt"), flush=True)
    events.start()
    usage.start_loop()
    srv = Server((host, port), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.exit(main())
