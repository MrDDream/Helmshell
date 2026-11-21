"""OpenAI Codex CLI (`codex`), second agent à côté de Claude Code.

Construction des commandes (session interactive dans tmux, tâches `codex exec --json`), lecture de la
sortie JSONL des tâches et de l'historique des conversations.

Vérifié sur Codex CLI 0.171.0 (installation autonome dans ~/.codex/packages, connexion ChatGPT) : options du
TUI et de `codex exec`, sortie JSONL, fichiers de session (sessions/AAAA/MM/JJ/rollout-…-<uuid>.jsonl), écrans
de validation et de confiance du TUI, bac à sable bubblewrap.
"""
import json
import os
import re
from pathlib import Path

from . import config
from .i18n import _

# Modes proposés -> (bac à sable, politique de validation) du TUI.
# `codex exec` ne pose jamais de question : seul le bac à sable compte (accès complet = sans bac à sable).
MODES = {
    "read-only": ("read-only", "on-request"),
    "auto": ("workspace-write", "on-request"),
    "full-access": ("danger-full-access", "never"),
}
MODE_ORDER = ("read-only", "auto", "full-access")
DEFAULT_MODE = "auto"
SID_RE = re.compile(r"^[A-Za-z0-9-]{8,80}$")


def bin():  # noqa: A001 — même nom que dans le registre des agents
    return config.get("codex_bin")


def available():
    """Le binaire `codex` est-il trouvable (chemin exécutable ou commande dans le PATH) ?"""
    from .agents import _resolvable
    return _resolvable(bin())


def default_mode():
    m = config.get("codex_default_mode")
    return m if m in MODES else DEFAULT_MODE


def _mode(mode):
    return mode if mode in MODES else default_mode()


def _tui_flags(path, mode):
    sandbox, approval = MODES[_mode(mode)]
    return ["-C", str(path), "-s", sandbox, "-a", approval]


def cmd_interactive(path, mode=None, cont=False, resume_id=None):
    """Commande du TUI interactif.

    Reprise : `codex resume <id>` ou `codex resume --last`, puis les options (la sous-commande `resume`
    accepte les mêmes options que le TUI : -C, -s, -a, -m). `--last` ne regarde que les sessions interactives
    du dossier courant : sans elles, l'appelant démarre une session neuve (voir has_interactive).
    """
    cmd = [bin()]
    if resume_id:
        cmd += ["resume", str(resume_id)]
    elif cont:
        cmd += ["resume", "--last"]
    return cmd + _tui_flags(path, mode)


def exec_sandbox_flags(mode):
    mode = _mode(mode)
    if mode == "full-access":
        return ["--dangerously-bypass-approvals-and-sandbox"]
    return ["-s", MODES[mode][0]]


def cmd_exec(path, mode=None, ephemeral=False):
    """`codex exec` non interactif, consigne lue sur l'entrée standard (`-`), évènements JSONL sur stdout."""
    cmd = [bin(), "exec", "--json", "--skip-git-repo-check", "-C", str(path)] + exec_sandbox_flags(mode)
    if ephemeral:
        cmd.append("--ephemeral")
    return cmd + ["-"]


# --- Sortie JSONL de `codex exec --json` ---------------------------------------------

def _item_tool(item):
    """(nom, détail) d'un élément « outil » de Codex, ou None si ce n'est pas un outil."""
    t = item.get("type")
    if t == "command_execution":
        return _("Commande"), str(item.get("command") or "").replace("\n", " ")[:200]
    if t == "file_change":
        paths = [str(c.get("path") or "") for c in item.get("changes") or [] if isinstance(c, dict)]
        return _("Fichiers"), ", ".join(p for p in paths if p)[:200]
    if t == "mcp_tool_call":
        return "MCP", f"{item.get('server') or ''} {item.get('tool') or ''}".strip()[:200]
    if t == "web_search":
        return _("Recherche web"), str(item.get("query") or "")[:200]
    if t in ("plan_update", "todo_list"):
        steps = item.get("items") or item.get("plan") or []
        done = sum(1 for s in steps if isinstance(s, dict) and (s.get("completed") or s.get("status") == "completed"))
        return "Plan", f"{done}/{len(steps)}" if steps else ""
    return None


def parse_exec(lines):
    """Résumé de la sortie de `codex exec --json`, même forme que tasks._parse : (évènements, résultat).

    évènements : {"k": "text", "t": …} ou {"k": "tool", "name": …, "detail": …}
    résultat   : {"text", "error", "is_error", "cost", "turns", "duration", "usage"} ou None (pas fini)
    """
    events, seen = [], set()
    last_text, error_msg, turns, usage, result = "", "", 0, None, None
    for line in lines:
        line = (line or "").strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except ValueError:
            e = None
        if not isinstance(e, dict):
            events.append({"k": "text", "t": line[:2000]})  # stderr de Codex, mêlé à la sortie
            continue
        kind = e.get("type") or ""
        if kind.startswith("item."):
            item = e.get("item") or {}
            if not isinstance(item, dict):
                continue
            iid = item.get("id")
            t = item.get("type")
            if t == "agent_message":
                if kind == "item.completed" and str(item.get("text") or "").strip():
                    last_text = str(item["text"])
                    events.append({"k": "text", "t": last_text[:6000]})
            elif t == "error":
                if kind == "item.completed":
                    events.append({"k": "text", "t": _("Erreur : {message}", message=str(item.get("message") or "")[:2000])})
            else:
                tool = _item_tool(item)
                # Un outil est signalé une fois (à son début, ou à sa fin s'il n'a pas eu d'évènement de début)
                if tool and (iid is None or iid not in seen):
                    events.append({"k": "tool", "name": tool[0], "detail": tool[1]})
            if iid is not None:
                seen.add(iid)
        elif kind == "turn.completed":
            turns += 1
            usage = e.get("usage") if isinstance(e.get("usage"), dict) else usage
            error_msg = ""  # une erreur passagère (reconnexion) suivie d'un tour réussi ne compte pas
            result = {"text": last_text[:8000], "error": False, "is_error": False, "cost": None,
                      "turns": turns, "duration": 0, "usage": usage}
        elif kind == "turn.failed":
            err = e.get("error")
            msg = (err.get("message") if isinstance(err, dict) else err) or error_msg or _("Échec du tour")
            events.append({"k": "text", "t": _("Erreur : {message}", message=str(msg)[:2000])})
            result = {"text": str(msg)[:8000], "error": True, "is_error": True, "cost": None,
                      "turns": turns, "duration": 0, "usage": usage}
        elif kind == "error":
            error_msg = str(e.get("message") or "")
            if error_msg:
                events.append({"k": "text", "t": _("Erreur : {message}", message=error_msg[:2000])})
    if error_msg and (result is None or not result["error"]):
        # Erreur fatale sans tour terminé après elle
        result = {"text": error_msg[:8000], "error": True, "is_error": True, "cost": None,
                  "turns": turns, "duration": 0, "usage": usage}
    return events[-400:], result


def last_message(output):
    """Dernier message de Codex dans une sortie `codex exec --json` ("" si aucun tour n'a réussi)."""
    _x, result = parse_exec(output.splitlines())
    if result and not result["error"] and result["text"]:
        return result["text"]
    return ""


# --- Historique des conversations ---------------------------------------------------
# $CODEX_HOME/sessions/AAAA/MM/JJ/rollout-<date>-<uuid>.jsonl ; première ligne
#   {"timestamp": …, "type": "session_meta", "payload": {"id": "<uuid>", "cwd": "/chemin", "source": "cli"|"exec", …}}
# puis des lignes {"type": "response_item" | "event_msg" | "turn_context" | …, "payload": {…}}.
# Messages, deux formes selon la version :
#   0.171 : event_msg/item_completed, item {"type": "UserMessage"|"AgentMessage"|"CommandExecution", …}
#   avant : event_msg/user_message {"message"} et event_msg/agent_message {"message"}
# Les response_item (message, custom_tool_call…) existent dans les deux. Les anciennes versions mettaient
# {"id", "timestamp", …} directement sur la première ligne, sans cwd : ces sessions-là sont ignorées.

UUID_TAIL_RE = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$", re.I)
MAX_FILES = 400  # sessions les plus récentes examinées
# Outil « exec » de Codex 0.171 : un petit script, ex. tools.exec_command({cmd:"ls", …})
EXEC_CMD_RE = re.compile(r"""exec_command\(\{\s*"?cmd"?\s*:\s*("(?:[^"\\]|\\.)*")""")


def home():
    return Path(os.environ.get("CODEX_HOME") or config.HOME / ".codex")


def _session_files():
    d = home() / "sessions"
    try:
        if not d.is_dir():
            return []
        files = [f for f in d.rglob("*.jsonl") if f.is_file()]
        files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    except OSError:
        return []
    return files[:MAX_FILES]


def _meta(f):
    """(id, cwd, horodatage, source) lus dans les premières lignes du fichier, ou None.
    source : "cli" (TUI), "exec" (tâche `codex exec`), "vscode"… ; "" si Codex ne l'écrit pas."""
    try:
        with open(f, encoding="utf-8", errors="replace") as fh:
            for _i in range(5):
                line = fh.readline()
                if not line:
                    break
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(e, dict):
                    continue
                for d in (e.get("payload"), e):
                    if isinstance(d, dict) and d.get("cwd"):
                        sid = str(d.get("id") or "")
                        if not SID_RE.match(sid):
                            m = UUID_TAIL_RE.search(f.stem)
                            sid = m.group(1) if m else ""
                        if not SID_RE.match(sid):
                            return None
                        return (sid, str(d["cwd"]), d.get("timestamp") or e.get("timestamp") or "",
                                str(d.get("source") or ""))
    except OSError:
        return None
    return None


def _same_dir(a, b):
    try:
        return Path(a).resolve() == Path(b).resolve()
    except (OSError, ValueError):
        return False


def _clean_user(text):
    """Texte tapé par l'utilisateur, ou "" pour le contexte injecté par Codex (<environment_context>…)."""
    text = str(text or "").strip()
    return "" if text.startswith("<") else text


def _content_text(content):
    """Texte d'une liste de morceaux [{"type": "text"|"Text"|"input_text"|"output_text", "text": …}]."""
    if isinstance(content, str):
        return content
    return "\n".join(str(c.get("text") or "") for c in content or [] if isinstance(c, dict) and c.get("text")).strip()


def _user_text(payload):
    """Texte d'un message de l'utilisateur (event_msg ou response_item), ou ""."""
    if not isinstance(payload, dict):
        return ""
    if payload.get("type") == "user_message":
        return _clean_user(payload.get("message"))
    if payload.get("type") == "message" and payload.get("role") == "user":
        return _clean_user(_content_text(payload.get("content")))
    return ""


def _tool_detail(p):
    """Détail lisible d'un appel d'outil (response_item) : la commande lancée si on la trouve."""
    raw = p.get("input") or p.get("arguments") or (p.get("action") or {}).get("command") or ""
    if isinstance(raw, list):
        raw = " ".join(str(x) for x in raw)
    elif not isinstance(raw, str):
        raw = json.dumps(raw, ensure_ascii=False)
    m = EXEC_CMD_RE.search(raw)
    if m:
        try:
            raw = json.loads(m.group(1))
        except ValueError:
            pass
    else:
        try:  # function_call : arguments JSON {"cmd": …} / {"command": [...]}
            args = json.loads(raw)
            if isinstance(args, dict):
                cmd = args.get("cmd") or args.get("command")
                if cmd:
                    raw = " ".join(cmd[-1:]) if isinstance(cmd, list) else str(cmd)
        except ValueError:
            pass
    return str(raw).replace("\n", " ").strip()[:200]


def _command_text(item):
    """Commande d'un élément CommandExecution (["/usr/bin/zsh", "-lc", "ls"] → "ls")."""
    cmd = item.get("command")
    if isinstance(cmd, list):
        cmd = cmd[-1] if len(cmd) >= 3 and str(cmd[-2]).startswith("-") else " ".join(str(x) for x in cmd)
    return str(cmd or "").replace("\n", " ").strip()[:200]


def _messages(f):
    """Messages d'un fichier de session : utilisateur, Codex, outils, dans l'ordre.

    Chaque message existe sous deux formes (event_msg et response_item) : on prend les event_msg quand le
    fichier en a, plus les appels d'outils des response_item ; sinon les response_item seuls."""
    events, items, tools = [], [], []
    has_cmd_events = False
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if not isinstance(e, dict):
                continue
            p = e.get("payload")
            when = e.get("timestamp") or ""
            if not isinstance(p, dict):
                continue
            t = p.get("type")
            if e.get("type") == "event_msg":
                if t == "item_completed" and isinstance(p.get("item"), dict):  # Codex 0.171
                    it = p["item"]
                    kind = it.get("type")
                    if kind == "UserMessage":
                        text = _clean_user(_content_text(it.get("content")))
                        if text:
                            events.append({"role": "user", "text": text[:8000], "when": when})
                    elif kind == "AgentMessage":
                        text = _content_text(it.get("content"))
                        if text:
                            events.append({"role": "assistant", "text": text[:8000], "when": when})
                    elif kind == "CommandExecution":
                        has_cmd_events = True
                        events.append({"role": "tool", "text": _("Commande"), "detail": _command_text(it), "when": when})
                elif t == "user_message":
                    text = _user_text(p)
                    if text:
                        events.append({"role": "user", "text": text[:8000], "when": when})
                elif t == "agent_message" and str(p.get("message") or "").strip():
                    events.append({"role": "assistant", "text": str(p["message"])[:8000], "when": when})
            elif e.get("type") == "response_item":
                if t == "message":
                    if p.get("role") == "user":
                        text = _user_text(p)
                        if text:
                            items.append({"role": "user", "text": text[:8000], "when": when})
                    elif p.get("role") == "assistant":
                        text = _content_text(p.get("content"))
                        if text:
                            items.append({"role": "assistant", "text": text[:8000], "when": when})
                elif t in ("function_call", "local_shell_call", "custom_tool_call"):
                    name = str(p.get("name") or t)
                    m = {"role": "tool", "text": _("Commande") if name in ("exec", "exec_command", "shell") else name,
                         "detail": _tool_detail(p), "when": when}
                    items.append(m)
                    tools.append(m)
    if events:
        # Commandes : celles des event_msg si le fichier en a (une par exécution réelle), sinon celles des
        # appels d'outils ; les deux à la fois feraient des doublons.
        msgs = events if has_cmd_events else events + tools
        return sorted(msgs, key=lambda m: m["when"])
    return items


def history(path, limit=8):
    """Conversations Codex passées dans ce dossier : [{id, title, mtime, prompts, size, agent}]."""
    out = []
    for f in _session_files():
        meta = _meta(f)
        if not meta or not _same_dir(meta[1], path):
            continue
        try:
            msgs = _messages(f)
            st = f.stat()
        except OSError:
            continue
        users = [m for m in msgs if m["role"] == "user"]
        title = users[0]["text"].strip().splitlines()[0][:120] if users else ""
        out.append({"id": meta[0], "title": title or _("Session sans titre"), "mtime": st.st_mtime,
                    "prompts": len(users), "size": st.st_size, "agent": "codex",
                    "task": meta[3] == "exec"})
        if len(out) >= limit:
            break
    return out


def history_all(root, limit=20):
    """Conversations Codex de tous les projets (dossiers directs de `root`) : [{…history, slug}], récentes d'abord."""
    try:
        base = Path(root).resolve()
    except OSError:
        return []
    out = []
    for f in _session_files():
        meta = _meta(f)
        if not meta:
            continue
        try:
            rel = Path(meta[1]).resolve().relative_to(base)
        except (ValueError, OSError):
            continue
        if len(rel.parts) != 1:
            continue  # sous-dossier d'un projet, ou la racine elle-même
        try:
            msgs = _messages(f)
            st = f.stat()
        except OSError:
            continue
        users = [m for m in msgs if m["role"] == "user"]
        if not users:
            continue
        out.append({"id": meta[0], "title": users[0]["text"].strip().splitlines()[0][:120] or _("Session sans titre"),
                    "mtime": st.st_mtime, "prompts": len(users), "size": st.st_size, "agent": "codex",
                    "task": meta[3] == "exec", "slug": rel.parts[0]})
        if len(out) >= limit:
            break
    return out


def find(path, sid):
    """Fichier de la session `sid` si elle appartient à ce dossier, sinon None."""
    if not SID_RE.match(sid or ""):
        return None
    for f in _session_files():
        meta = _meta(f)
        if meta and meta[0] == sid and _same_dir(meta[1], path):
            return f
    return None


def transcript(path, sid, limit=400):
    """Messages d'une conversation Codex passée : même forme que projects.transcript."""
    from .util import ApiError
    f = find(path, sid)
    if not f:
        raise ApiError(_("Session introuvable"), 404)
    try:
        msgs = _messages(f)
    except OSError:
        raise ApiError(_("Session illisible"), 404) from None
    users = [m for m in msgs if m["role"] == "user"]
    title = users[0]["text"].strip().splitlines()[0][:120] if users else ""
    return {"id": sid, "title": title, "messages": msgs[-limit:], "total": len(msgs), "agent": "codex"}


def has_interactive(path):
    """Une session interactive (TUI) de Codex existe-t-elle déjà pour ce dossier ? `codex resume --last` n'en
    regarde pas d'autre : sans elle, il afficherait une erreur au lieu de démarrer."""
    for f in _session_files():
        meta = _meta(f)
        if meta and meta[3] != "exec" and _same_dir(meta[1], path):
            return True
    return False


# --- État du TUI, lu à l'écran -------------------------------------------------------
# Codex 0.171 n'écrit pas d'état dans un fichier comme Claude : on lit le bas de l'écran du volet tmux.
#   travaille : « • Working (12s • esc to interrupt) »
#   attend    : « Would you like to run the following command? » … « Press enter to confirm or esc to cancel »,
#               « Would you like to make the following edits? », écran « Trust this folder? »
#   sinon     : au repos (« › Ask Codex to do anything »)

WAIT_RE = re.compile(r"Press enter to confirm or esc to cancel|Would you like to (?:run|make|apply|allow|grant)"
                     r"|Trust this folder\?|Yes, proceed \(y\)|enter continue · esc back", re.I)
BUSY_RE = re.compile(r"esc to interrupt|^\s*• Working \(", re.I | re.M)
QUESTION_RE = re.compile(r"^\s*(Would you like to .+?\?|Trust this folder\?)", re.M)
CMD_LINE_RE = re.compile(r"^\s*\$ (.+)$", re.M)
REASON_RE = re.compile(r"^\s*Reason: (.+)$", re.M)


def screen_state(text):
    """(statut, question) d'après l'écran du TUI : ("waiting", "Lancer : ls") / ("busy", "") / ("idle", "")."""
    lines = [ln for ln in (text or "").splitlines() if ln.strip()]
    tail = "\n".join(lines[-30:])
    if WAIT_RE.search(tail):
        q = QUESTION_RE.search(tail)
        question = q.group(1).strip() if q else ""
        if question.startswith("Trust"):
            return "waiting", _("Faire confiance à ce dossier ?")
        detail = (REASON_RE.search(tail) or CMD_LINE_RE.search(tail))
        if detail:
            question = detail.group(1).strip()
        return "waiting", (question or _("Validation demandée"))[:300]
    if BUSY_RE.search("\n".join(lines[-12:])):
        return "busy", ""
    return "idle", ""


# --- Contexte et limites du forfait (évènements token_count des fichiers de session) ---

def _last_token_count(f):
    """Dernier évènement token_count d'un fichier de session (payload), ou None. Lit la fin du fichier."""
    try:
        with open(f, "rb") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            fh.seek(max(0, size - 256 * 1024))
            data = fh.read().decode("utf-8", errors="replace")
    except OSError:
        return None
    for line in reversed(data.splitlines()):
        if '"token_count"' not in line:
            continue
        try:
            e = json.loads(line)
        except ValueError:
            continue
        p = e.get("payload") if isinstance(e, dict) else None
        if isinstance(p, dict) and p.get("type") == "token_count":
            return p
    return None


def session_context(path, since=0):
    """Contexte de la session interactive la plus récente de ce dossier, ouverte après `since` :
    {used, size, tokens} (même forme que usage.session_context) ou None."""
    for f in _session_files():
        try:
            if f.stat().st_mtime < since:
                break  # fichiers triés du plus récent au plus ancien
        except OSError:
            continue
        meta = _meta(f)
        if not meta or meta[3] == "exec" or not _same_dir(meta[1], path):
            continue
        p = _last_token_count(f)
        info = (p or {}).get("info") or {}
        size = info.get("model_context_window") or 0
        last = info.get("last_token_usage") or {}
        if not size or not isinstance(last, dict):
            return None
        tokens = int(last.get("total_tokens") or 0)
        return {"used": min(100.0, 100 * tokens / size), "size": size, "tokens": tokens}
    return None


def _window_label(minutes):
    if not minutes:
        return _("Limite")
    if minutes < 24 * 60:
        return _("Session ({n} h)", n=round(minutes / 60))
    if minutes <= 7 * 24 * 60:
        return _("Semaine")
    return _("Mois")


def _limits_out(rl, updated):
    """Limites au format de l'interface, depuis un objet rate_limits de Codex (fichier de session : snake_case,
    serveur d'application : camelCase)."""
    out = {"plan": str(rl.get("plan_type") or rl.get("planType") or ""), "updated": updated, "limits": []}
    for key in ("primary", "secondary"):
        w = rl.get(key)
        if not isinstance(w, dict):
            continue
        used = w.get("used_percent", w.get("usedPercent"))
        if used is None:
            continue
        minutes = int(w.get("window_minutes") or w.get("windowDurationMins") or 0)
        out["limits"].append({"id": "codex_" + key, "label": _window_label(minutes), "used": float(used),
                              "resets_at": w.get("resets_at", w.get("resetsAt")), "window": minutes * 60})
    return out


def read_live_limits(timeout=25):
    """Limites du forfait lues en direct par `codex app-server` (méthode account/rateLimits/read) : comme /usage
    pour Claude, une requête au compte, sans message au modèle ni jeton consommé. Objet rate_limits ou erreur."""
    import select
    import subprocess
    import time
    from .util import child_env
    proc = subprocess.Popen([bin(), "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, env=child_env(), cwd=str(config.DATA_DIR))
    try:
        for msg in ({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "helmshell", "version": "1"}}},
                    {"method": "initialized"}, {"id": 2, "method": "account/rateLimits/read"}):
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        end = time.time() + timeout
        while time.time() < end:
            ready, _w, _x = select.select([proc.stdout], [], [], max(0.1, end - time.time()))
            if not ready:
                break
            line = proc.stdout.readline()
            if not line:
                break
            try:
                o = json.loads(line)
            except ValueError:
                continue
            if o.get("id") == 2:
                if o.get("error"):
                    raise RuntimeError(str((o["error"] or {}).get("message") or o["error"])[:300])
                rl = (o.get("result") or {}).get("rateLimits")
                if not isinstance(rl, dict):
                    raise RuntimeError(_("réponse sans limites"))
                return rl
        raise RuntimeError(_("pas de réponse de Codex"))
    finally:
        proc.kill()
        proc.wait(timeout=5)


def rate_limits():
    """Limites du forfait Codex au dernier échange : {"plan", "updated", "limits": [{id, label, used,
    resets_at, window}]} ou None. Codex les joint à chaque évènement token_count."""
    for f in _session_files()[:40]:
        p = _last_token_count(f)
        rl = (p or {}).get("rate_limits")
        if not isinstance(rl, dict):
            continue
        try:
            updated = f.stat().st_mtime
        except OSError:
            updated = 0
        return _limits_out(rl, updated)
    return None


# --- Bac à sable (Linux : bubblewrap) -------------------------------------------------
# Les modes « Lecture seule » et « Automatique » font tourner chaque commande de Codex dans bubblewrap.
# Sur Ubuntu 24.04 et suivantes, AppArmor interdit les espaces de noms aux programmes sans profil : la copie de
# bubblewrap embarquée par Codex échoue (« bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted »)
# et toutes les commandes sont refusées. Le paquet bubblewrap du système a, lui, son profil AppArmor.
# Le test tourne sur l'hôte, là où Codex s'exécute (tmux run-shell), pas dans le conteneur de Helmshell.

_sandbox = {"t": 0.0, "bin": "", "res": None}
SANDBOX_TTL = 600


def sandbox_check(force=False):
    """{"ok": bool, "detail": str, "fix": str} ; None si le test n'a pas pu tourner (tmux, Codex absent)."""
    import shlex
    import time
    from .util import run, tmux_cmd
    b = bin()
    now = time.time()
    if not force and _sandbox["res"] is not None and _sandbox["bin"] == b and now - _sandbox["t"] < SANDBOX_TTL:
        return _sandbox["res"]
    if not available():
        return None
    script = (f"timeout 20 {shlex.quote(b)} sandbox -- true 2>&1 | tail -n 3; echo \"rc=${{PIPESTATUS[0]}}\"; "
              "command -v bwrap >/dev/null && echo bwrap=1 || echo bwrap=0")
    try:
        code, out = run(tmux_cmd("run-shell", f"bash -c {shlex.quote(script)}"), timeout=30)
    except Exception:  # noqa: BLE001 — tmux absent ou socket de l'hôte manquant
        return None
    if code != 0 or "rc=" not in out:
        return None
    rc = (re.search(r"rc=(\d+)", out) or [None, "1"])[1]
    has_bwrap = "bwrap=1" in out
    detail = "\n".join(ln for ln in out.splitlines() if not ln.startswith(("rc=", "bwrap="))).strip()[:400]
    ok = rc == "0"
    fix = ""
    if not ok:
        fix = "sudo apt install bubblewrap" if not has_bwrap else ""
    res = {"ok": ok, "detail": detail, "fix": fix, "system_bwrap": has_bwrap}
    _sandbox.update(t=now, bin=b, res=res)
    return res
