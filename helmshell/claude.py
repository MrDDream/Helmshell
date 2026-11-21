"""Sessions `claude remote-control` lancées dans tmux (une par projet : claude-<slug>)."""
import re
import shlex
import time
from pathlib import Path

from . import config
from .i18n import _
from .util import ApiError, child_env, log_activity, run, tmux_cmd, tmux_style, tmux_slug

PREFIX = "claude-"
MODES = {"default", "acceptEdits", "plan", "auto", "dontAsk"}
RC_ACTIVE_RE = re.compile(r"/rc active|Remote Control (?:is )?(?:active|connected|enabled)", re.I)
URL_RE = re.compile(r"https://claude\.ai/code[^\s'\"<>)\]│]*")
EXIT_RE = re.compile(r"\[helmshell:fin code=(\d+)\]")
QUESTION_RE = re.compile(r"(\[y/N\]|\[Y/n\]|\(y/n\)|\(Y/n\)|\(y/N\))\s*$")


def tmux_name(slug):
    return PREFIX + tmux_slug(slug)


def _tmux(*args, timeout=10):
    try:
        return run(tmux_cmd(*args), timeout=timeout)
    except ApiError as e:  # serveur tmux de l'hôte absent : rien ne tourne
        return 1, str(e)


def running(slug):
    code, _x = _tmux("has-session", "-t", "=" + tmux_name(slug))
    return code == 0


def capture(slug, lines=400):
    code, out = _tmux("capture-pane", "-p", "-J", "-t", f"={tmux_name(slug)}:", "-S", f"-{lines}")
    return out if code == 0 else ""


def _env(slug, key):
    code, out = _tmux("show-environment", "-t", "=" + tmux_name(slug), key)
    if code == 0 and "=" in out:
        return out.split("=", 1)[1]
    return ""


def _created(slug):
    code, out = _tmux("display-message", "-p", "-t", f"={tmux_name(slug)}:", "#{session_created}")
    try:
        return int(out) if code == 0 else 0
    except ValueError:
        return 0


def parse(output):
    lines = [l.rstrip() for l in output.splitlines()]
    while lines and not lines[-1].strip():
        lines.pop()
    urls = URL_RE.findall(output)
    m = EXIT_RE.search(output)
    last = lines[-1] if lines else ""
    question = ""
    if QUESTION_RE.search(last):
        question = last.strip()
    if m:
        phase = "exited"
    elif question:
        phase = "question"
    elif urls:
        phase = "ready"
    else:
        phase = "starting"
    return {"phase": phase, "url": urls[-1].rstrip(".,") if urls else "",
            "question": question, "exit_code": int(m.group(1)) if m else None}


def state(slug, light=False):
    """État d'une session. `light` = sans la sortie complète (pour les listes)."""
    if not running(slug):
        return {"running": False}
    out = capture(slug, 200 if light else 400)
    info = parse(out)
    started = _created(slug)
    # Sans lien affiché ni question en attente après quelques secondes : la session tourne.
    if info["phase"] == "starting" and started and time.time() - started > 12:
        info["phase"] = "running"
    info.update({"running": True, "tmux": tmux_name(slug), "started": started,
                 "mode": _env(slug, "HELMSHELL_MODE"), "spawn": _env(slug, "HELMSHELL_SPAWN") or "same-dir"})
    if not light:
        tail = [l for l in out.splitlines()]
        while tail and not tail[-1].strip():
            tail.pop()
        info["output"] = "\n".join(tail[-60:])
    return info


def list_sessions():
    code, out = _tmux("list-sessions", "-F", "#{session_name}")
    if code != 0:
        return []
    from . import projects
    root = projects.root()
    sessions = []
    for name in out.splitlines():
        if not name.startswith(PREFIX):
            continue
        # retrouve le slug du projet correspondant
        slug = None
        for p in root.iterdir():
            if p.is_dir() and tmux_name(p.name) == name:
                slug = p.name
                break
        if not slug:
            continue
        st = state(slug, light=True)
        meta = config.project_meta(slug)
        st.update({"slug": slug, "name": meta.get("name") or slug, "path": str(root / slug)})
        sessions.append(st)
    return sessions


SPAWN_MODES = {"same-dir", "worktree"}


def start(slug, mode, cont=False, spawn=None):
    from . import projects
    p = projects.project_dir(slug)
    if mode not in MODES:
        raise ApiError(_("Mode de permission inconnu"))
    name = tmux_name(slug)
    if running(slug):
        st = parse(capture(slug))
        if st["phase"] != "exited":
            raise ApiError(_("Une session Claude tourne déjà pour ce projet"))
        _tmux("kill-session", "-t", "=" + name)
    meta = config.project_meta(slug)
    cmd = [config.get("claude_bin"), "remote-control", "--name", meta.get("name") or slug,
           "--permission-mode", mode]
    if cont and _has_conversation(p):
        cmd.append("--continue")
    if spawn and spawn != "same-dir":
        if spawn not in SPAWN_MODES:
            raise ApiError(_("Mode de lancement inconnu"))
        if not (p / ".git").exists():
            raise ApiError(_("Les copies de travail (worktrees) demandent un dépôt Git"))
        cmd += ["--spawn", spawn]
    # Quand Claude s'arrête, on garde la fenêtre ouverte pour pouvoir lire l'erreur.
    shell = (f"{shlex.join(cmd)}; code=$?; echo; echo \"[helmshell:fin code=$code]\"; "
             "exec sleep 86400")
    env = child_env()
    code, out = run(tmux_cmd("new-session", "-d", "-s", name, "-x", "200", "-y", "50", "-c", str(p),
                     "-e", f"PATH={env['PATH']}", "-e", f"HELMSHELL_MODE={mode}", "-e", f"HELMSHELL_SPAWN={spawn or 'same-dir'}",
                     "bash", "-lc", shell), timeout=15)
    if code != 0:
        raise ApiError(_("Impossible de lancer tmux : {error}", error=out))
    log_activity(_("Session Remote Control démarrée sur {name}", name=meta.get("name") or slug), "claude", slug)
    time.sleep(0.6)
    return state(slug)


def stop(slug):
    if not running(slug):
        return
    name = tmux_name(slug)
    _tmux("send-keys", "-t", f"={name}:", "C-c")
    for _i in range(10):
        time.sleep(0.25)
        if parse(capture(slug))["phase"] == "exited":
            break
    _tmux("kill-session", "-t", "=" + name)
    meta = config.project_meta(slug)
    log_activity(_("Session Claude arrêtée sur {name}", name=meta.get("name") or slug), "stop", slug)


ALLOWED_KEYS = {"Enter", "C-c", "Escape", "Up", "Down", "Tab"}


def send(slug, text=None, key=None):
    if not running(slug):
        raise ApiError(_("Aucune session en cours"), 404)
    target = f"={tmux_name(slug)}:"
    if text:
        if len(text) > 2000:
            raise ApiError(_("Texte trop long"))
        _tmux("send-keys", "-t", target, "-l", text)
    if key:
        if key not in ALLOWED_KEYS:
            raise ApiError(_("Touche non autorisée"))
        _tmux("send-keys", "-t", target, key)
    time.sleep(0.4)
    return state(slug)


# --- Session interactive « du dépôt » ------------------------------------------
# Une session tmux nommée comme le dossier du projet, avec `claude` lancé dedans en mode
# interactif. On peut s'y attacher depuis l'onglet Claude (ou en SSH) et activer Remote
# Control à la volée avec la commande /remote-control.
#
# Codex (OpenAI) a sa propre session par projet, à côté : « codex-<projet> » (« codex-<projet>@<branche> »
# pour la copie d'une branche). Les fonctions repo_* prennent `agent="claude"` (défaut) ou "codex".
# Pour Codex : pas de Remote Control ni de lien claude.ai ; son état (travaille, attend une validation) est lu
# à l'écran du TUI.

SHELLS = {"bash", "zsh", "sh", "dash", "fish", "-bash", "-zsh", "login"}
RESERVED = ("claude-", "tache-", "helmshell-", "codex-")
CODEX_PREFIX = "codex-"
REPO_AGENTS = ("claude", "codex")


def _agent_id(agent):
    agent = agent or "claude"
    if agent not in REPO_AGENTS:
        raise ApiError(_("Agent inconnu"))
    return agent


def _label(agent):
    return "Codex" if agent == "codex" else "Claude"


def repo_session(slug, agent="claude"):
    name = tmux_slug(slug)
    if _agent_id(agent) == "codex":
        return CODEX_PREFIX + name
    # Préfixes réservés aux sessions de Helmshell : « claude-x » devient « depot-claude-x », et un projet
    # appelé « depot-… » prend aussi le préfixe (sinon les deux auraient la même session).
    return "depot-" + name if name.startswith(RESERVED + ("depot-",)) else name


def _where(slug, branch=None, agent="claude"):
    """(session tmux, dossier, nom affiché) : dossier principal, ou copie de travail d'une branche."""
    from . import branches, projects
    p = projects.project_dir(slug)
    label = config.project_meta(slug).get("name") or slug
    base = repo_session(slug, agent)
    if not branch:
        return base, p, label
    return f"{base}@{branches.safe(branch)}", branches.path_of(slug, branch), f"{label} · {branch}"


def _bridge(name, pane_id, since):
    """Fiche que Claude écrit pour chaque session (~/.claude/sessions/<pid>.json).

    On y trouve la session tmux qui l'héberge (« Atlas:@12.%12 ») et, quand Remote Control
    est actif, son identifiant distant (bridgeSessionId) : de quoi refaire le lien claude.ai
    sans rien taper dans le terminal.
    """
    import json
    best = None
    try:
        files = list((config.HOME / ".claude" / "sessions").glob("*.json"))
    except OSError:
        return None
    for f in files:
        try:
            d = json.loads(f.read_text())
        except (OSError, ValueError):
            continue
        where = str(d.get("tmux") or "")
        if not where.startswith(name + ":") or (pane_id and not where.endswith("." + pane_id)):
            continue
        started = (d.get("startedAt") or 0) / 1000
        if started + 5 < since:  # fiche d'une session tmux précédente du même nom
            continue
        if not best or started > (best.get("startedAt") or 0) / 1000:
            best = d
    return best


def _pane(name, fmt):
    code, out = _tmux("display-message", "-p", "-t", f"={name}:", fmt)
    return out if code == 0 else ""


def repo_state(slug, branch=None, agent="claude"):
    """État de la session du dépôt. `claude` (nom historique) = l'agent tourne au premier plan, comme `alive`."""
    agent = _agent_id(agent)
    name = _where(slug, branch, agent)[0]
    if _tmux("has-session", "-t", "=" + name)[0] != 0:
        return {"exists": False, "name": name, "claude": False, "alive": False, "url": "", "rc": False,
                "branch": branch, "agent": agent}
    cmd = _pane(name, "#{pane_current_command}")
    try:
        created = int(_pane(name, "#{session_created}") or 0)
    except ValueError:
        created = 0
    # L'agent tourne au premier plan du volet (le shell lui laisse le terminal : contrôle de tâches)
    alive = bool(cmd) and cmd not in SHELLS
    if agent == "codex":
        # État lu à l'écran du TUI (travaille, attend une validation, au repos), contexte lu dans sa session
        from . import codex
        status, question = "", ""
        if alive:
            code, out = _tmux("capture-pane", "-p", "-J", "-t", f"={name}:")
            status, question = codex.screen_state(out if code == 0 else "")
        ctx = codex.session_context(_where(slug, branch, agent)[1], created - 5) if alive else None
        return {"exists": True, "name": name, "branch": branch, "agent": agent, "claude": alive, "alive": alive,
                "command": cmd, "created": created, "url": "", "rc": False, "status": status,
                "question": question, "since": 0, "context": ctx}
    code, out = _tmux("capture-pane", "-p", "-J", "-t", f"={name}:", "-S", "-2000")
    urls = URL_RE.findall(out if code == 0 else "")
    text = out if code == 0 else ""
    url = urls[-1].rstrip(".,") if urls and alive else ""
    info = _bridge(name, _pane(name, "#{pane_id}"), created) if alive else None
    if info and info.get("bridgeSessionId"):
        url = "https://claude.ai/code/" + info["bridgeSessionId"]
    # Le lien disparaît de l'écran quand Claude referme son panneau : on le garde dans la session.
    saved = _session_env(name, "HELMSHELL_RC_URL")
    if url and url != saved:
        _tmux("set-environment", "-t", "=" + name, "HELMSHELL_RC_URL", url)
    elif not url and alive:
        url = saved
    return {"exists": True, "name": name, "branch": branch, "agent": agent, "claude": alive, "alive": alive,
            "command": cmd, "created": created,
            "url": url, "rc": alive and bool(url or RC_ACTIVE_RE.search(text[-6000:])),
            "status": (info or {}).get("status", "") if alive else "",
            "since": ((info or {}).get("statusUpdatedAt") or 0) / 1000,
            "context": _context(info) if alive else None}


def _context(info):
    from . import usage
    return usage.session_context((info or {}).get("sessionId"))


def _session_env(name, key):
    code, out = _tmux("show-environment", "-t", "=" + name, key)
    return out.split("=", 1)[1] if code == 0 and "=" in out else ""


STATUSLINE = Path(__file__).resolve().parent / "statusline.py"


def _has_conversation(path):
    d = config.HOME / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9-]", "-", str(path))
    try:
        return any(d.glob("*.jsonl"))
    except OSError:
        return False


def _claude_cmd(slug, rc=False, mode=None, cont=False, branch=None):
    import json
    # Nom de la session (liste /resume, claude.ai, app mobile) : celui du projet, ex. « Atlas » ou « Atlas · ma-branche »
    label = _where(slug, branch)[2]
    cmd = [config.get("claude_bin"), "--name", label,
           "--permission-mode", mode or config.get("default_mode") or "default"]
    if cont and _has_conversation(_where(slug, branch)[1]):
        # Sans conversation passée dans ce dossier, --continue ferait échouer le lancement
        cmd.append("--continue")
    # Ligne d'état de Helmshell : elle relève le contexte et les limites du forfait pour la page d'accueil
    settings = {"statusLine": {"type": "command", "command": f"python3 {shlex.quote(str(STATUSLINE))}"}}
    if rc:
        cmd += ["--remote-control", label]
    else:
        # Remote Control seulement sur demande (bouton), même si ~/.claude/settings.json l'active au démarrage
        settings["remoteControlAtStartup"] = False
    cmd += ["--settings", json.dumps(settings, separators=(",", ":"))]
    return cmd


def _codex_cmd(slug, mode=None, cont=False, branch=None, resume_id=None):
    from . import agents, codex
    agents.require("codex")
    path = _where(slug, branch, "codex")[1]
    # `codex resume --last` sans session interactive passée dans ce dossier s'arrête sur une erreur :
    # on démarre alors une session neuve.
    if cont and not codex.has_interactive(path):
        cont = False
    return codex.cmd_interactive(path, mode, cont, resume_id)


def _agent_cmd(slug, agent="claude", rc=False, mode=None, cont=False, branch=None):
    if agent == "codex":
        return _codex_cmd(slug, mode, cont, branch)
    return _claude_cmd(slug, rc, mode, cont, branch)


def _type(name, cmd):
    """Tape la commande dans le shell de la session puis Entrée."""
    _tmux("send-keys", "-t", f"={name}:", "-l", shlex.join(cmd))
    _tmux("send-keys", "-t", f"={name}:", "Enter")


def _new_shell(slug, branch=None, agent="claude"):
    """Session tmux sur le shell du projet (ou de la copie de la branche). Renvoie son nom."""
    name, p, _x = _where(slug, branch, agent)
    env = child_env()
    args = ["new-session", "-d", "-s", name, "-x", "200", "-y", "50", "-c", str(p), "-e", f"PATH={env['PATH']}",
            "-e", f"HELMSHELL_AGENT={agent}"]
    if branch:
        args += ["-e", f"HELMSHELL_BRANCH={branch}"]
    code, out = run(tmux_cmd(*args), timeout=15)
    if code != 0:
        raise ApiError(_("Impossible de lancer tmux : {error}", error=out))
    tmux_style()
    return name


def repo_ensure(slug, rc=False, mode=None, cont=False, branch=None, agent="claude"):
    """Crée la session (avec l'agent dedans) si elle n'existe pas. Renvoie son nom."""
    agent = _agent_id(agent)
    name, _x, label = _where(slug, branch, agent)
    if _tmux("has-session", "-t", "=" + name)[0] == 0:
        return name
    cmd = _agent_cmd(slug, agent, rc, mode, cont, branch)  # avant la session : Codex absent -> erreur claire
    # Shell interactif normal, puis l'agent tapé dedans : quand il se termine on retrouve
    # le shell du projet (et la commande dans l'historique), et tmux voit l'agent au premier plan.
    _new_shell(slug, branch, agent)
    _type(name, cmd)
    if agent == "codex":
        log_activity(_("Codex lancé dans tmux « {name} » ({label})", name=name, label=label), "claude", slug)
    elif rc:
        log_activity(_("Claude lancé dans tmux « {name} » ({label}) avec Remote Control", name=name, label=label),
                     "claude", slug)
    else:
        log_activity(_("Claude lancé dans tmux « {name} » ({label})", name=name, label=label), "claude", slug)
    return name


def repo_open(slug, mode=None, cont=False, rc=False, branch=None, agent="claude"):
    """Ouvre l'agent dans la session du dépôt avec les options choisies (fenêtre « Lancer Claude »)."""
    from . import agents
    agent = _agent_id(agent)
    if mode:
        agents.check_mode(agent, mode)
    st = repo_state(slug, branch, agent)
    if st["exists"] and st["alive"]:
        if branch:
            raise ApiError(_("{agent} est déjà ouvert sur la branche {branch}", agent=_label(agent), branch=branch))
        raise ApiError(_("{agent} est déjà ouvert dans ce projet", agent=_label(agent)))
    if st["exists"]:
        # Session tmux restée sur le shell : on y relance l'agent
        _type(st["name"], _agent_cmd(slug, agent, rc, mode, cont, branch))
    else:
        repo_ensure(slug, rc, mode, cont, branch, agent)
    time.sleep(0.8)
    return repo_state(slug, branch, agent)


def repo_remote_control(slug, branch=None, agent="claude"):
    """Active Remote Control dans la session du dépôt (la crée ou relance Claude au besoin)."""
    if _agent_id(agent) != "claude":
        raise ApiError(_("Remote Control n'existe que pour Claude Code"))
    st = repo_state(slug, branch)
    name = st["name"]
    if not st["exists"]:
        repo_ensure(slug, rc=True, branch=branch)
    elif not st["claude"]:
        _type(name, _claude_cmd(slug, rc=True, branch=branch))
    else:
        _tmux("send-keys", "-t", f"={name}:", "-l", "/remote-control")
        time.sleep(0.4)  # laisse l'autocomplétion des commandes s'afficher
        _tmux("send-keys", "-t", f"={name}:", "Enter")
        # Claude affiche le lien dans un panneau : on le relève puis on referme le panneau.
        for _i in range(12):
            time.sleep(0.5)
            code, out = _tmux("capture-pane", "-p", "-J", "-t", f"={name}:")
            if code == 0 and URL_RE.search(out):
                st = repo_state(slug, branch)
                if "Esc to close" in out:
                    _tmux("send-keys", "-t", f"={name}:", "Escape")
                return st
    time.sleep(1.2)
    return repo_state(slug, branch)


def repo_restart(slug, branch=None, agent="claude"):
    """Relance l'agent dans la session (après une sortie) sans toucher au reste."""
    agent = _agent_id(agent)
    st = repo_state(slug, branch, agent)
    if not st["exists"]:
        repo_ensure(slug, branch=branch, agent=agent)
    elif not st["alive"]:
        if agent == "claude":
            _tmux("set-environment", "-t", "=" + st["name"], "-u", "HELMSHELL_RC_URL")
        _type(st["name"], _agent_cmd(slug, agent, branch=branch))
    time.sleep(0.6)
    return repo_state(slug, branch, agent)


BOX_RE = re.compile(r"^[\s─━│┃╭╮╰╯┌┐└┘├┤┬┴┼═║▔▁▏▕▎▐▌█▛▜▝▘▗▖▀▄]*$")


def preview(slug, lines=8, branch=None, name=None, agent="claude"):
    """Dernières lignes utiles du terminal (sans les cadres de l'interface de l'agent)."""
    code, out = _tmux("capture-pane", "-p", "-J", "-t", f"={name or _where(slug, branch, agent)[0]}:")
    if code != 0:
        return ""
    keep = [l.rstrip() for l in out.splitlines() if l.strip() and not BOX_RE.match(l)]
    return "\n".join(l[:240] for l in keep[-lines:])


def repo_key(slug, branch=None, agent="claude"):
    """Clé unique d'une session du dépôt : « projet », « projet@branche » ; « codex:… » pour Codex."""
    key = f"{slug}@{branch}" if branch else slug
    return "codex:" + key if agent == "codex" else key


def list_repo_sessions(with_preview=False, agent=None):
    """Sessions « dépôt » ouvertes, des deux agents (`agent` pour n'en garder qu'un)."""
    code, out = _tmux("list-sessions", "-F", "#{session_name}")
    if code != 0:
        return []
    names = set(out.splitlines())
    wanted = (_agent_id(agent),) if agent else REPO_AGENTS
    from . import projects
    root = projects.root()
    items = []
    for p in sorted(root.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_dir() or not projects.SLUG_RE.match(p.name):
            continue
        meta = config.project_meta(p.name)
        for ag in wanted:
            base = repo_session(p.name, ag)
            # Dossier principal puis copies des branches (« Atlas@ma-branche », branche notée dans la session)
            found = [None] if base in names else []
            found += [b for n in sorted(names) if n.startswith(base + "@") and (b := _session_env(n, "HELMSHELL_BRANCH"))]
            for branch in found:
                try:
                    st = repo_state(p.name, branch, ag)
                    path = _where(p.name, branch, ag)[1]
                except ApiError:  # copie supprimée entre-temps
                    continue
                if not st["exists"]:
                    continue
                item = {"slug": p.name, "branch": branch, "key": repo_key(p.name, branch, ag), "agent": ag,
                        "name": (meta.get("name") or p.name) + (f" · {branch}" if branch else ""),
                        "path": str(path), "tmux": st["name"],
                        "started": st.get("created", 0), "claude": st["claude"], "alive": st["alive"],
                        "rc": st["rc"], "url": st["url"],
                        "status": st.get("status", ""), "since": st.get("since", 0),
                        "question": st.get("question", "")}
                if with_preview:
                    item["preview"] = preview(p.name, name=st["name"])
                items.append(item)
    return items


def repo_send(slug, text=None, key=None, branch=None, agent="claude"):
    """Tape du texte (puis Entrée) ou une touche dans la session du dépôt."""
    agent = _agent_id(agent)
    name = _where(slug, branch, agent)[0]
    if _tmux("has-session", "-t", "=" + name)[0] != 0:
        raise ApiError(_("Aucune session ouverte pour ce projet"), 404)
    if text:
        text = str(text)
        if len(text) > 2000:
            raise ApiError(_("Message trop long (2000 caractères au plus)"))
        _tmux("send-keys", "-t", f"={name}:", "-l", text.replace("\r", ""))
        time.sleep(0.15)
        _tmux("send-keys", "-t", f"={name}:", "Enter")
    if key:
        if key not in ALLOWED_KEYS:
            raise ApiError(_("Touche non autorisée"))
        _tmux("send-keys", "-t", f"={name}:", key)
    time.sleep(0.3)
    return repo_state(slug, branch, agent)


UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def repo_resume(slug, sid, agent="claude"):
    """Reprend une conversation passée du projet dans sa session tmux."""
    from . import codex, projects
    agent = _agent_id(agent)
    p = projects.project_dir(slug)
    if agent == "codex":
        if not codex.find(p, sid):
            raise ApiError(_("Conversation introuvable pour ce projet"), 400)
    elif not UUID_RE.match(sid or "") or not (projects._transcript_dir(slug) / f"{sid}.jsonl").is_file():
        raise ApiError(_("Conversation introuvable pour ce projet"), 400)
    st = repo_state(slug, agent=agent)
    name = st["name"]
    if st["exists"] and st["alive"]:
        if agent == "codex":
            raise ApiError(_("Codex tourne déjà dans ce projet : ferme-le avant de reprendre une conversation"), 409)
        raise ApiError(_("Claude tourne déjà dans ce projet : ferme-le (/exit) avant de reprendre une conversation"), 409)
    if agent == "codex":
        cmd = _codex_cmd(slug, resume_id=sid)
    else:
        cmd = _claude_cmd(slug)
        cmd[1:1] = ["--resume", sid]
    if not st["exists"]:
        _new_shell(slug, agent=agent)
    _type(name, cmd)
    meta = config.project_meta(slug)
    log_activity(_("Conversation reprise dans tmux « {name} » ({label})", name=name, label=meta.get("name") or slug),
                 "claude", slug)
    time.sleep(0.6)
    return repo_state(slug, agent=agent)


def repo_kill(slug, branch=None, log=True, agent="claude"):
    name, _x, label = _where(slug, branch, agent)
    if _tmux("kill-session", "-t", "=" + name)[0] == 0 and log:
        log_activity(_("Session tmux « {name} » fermée ({label})", name=name, label=label), "stop", slug)


def repo_kill_all(slug, branch=None, log=True):
    """Ferme les sessions du dépôt des deux agents (projet ou copie supprimés)."""
    for agent in REPO_AGENTS:
        repo_kill(slug, branch, log, agent)
