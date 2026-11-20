"""OpenAI Codex CLI (`codex`), second agent à côté de Claude Code.

Construction des commandes (session interactive dans tmux, tâches `codex exec --json`), lecture de la
sortie JSONL des tâches et de l'historique des conversations.

Écrit d'après la documentation de Codex CLI 0.170.0, sans Codex installé : tout ce qui touche au format
des fichiers de session (historique) est à vérifier sur une vraie installation (voir les « À VÉRIFIER »).
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

    Reprise : `codex resume <id>` ou `codex resume --last`, puis les options (le sous-commande `resume`
    accepte les mêmes options que le TUI : -C, -s, -a, -m).
    À VÉRIFIER : `resume --last` reprend la dernière session du dossier courant (filtrée par cwd dans les
    versions récentes) ; si aucune session n'existe, Codex en démarre une nouvelle ou affiche un sélecteur.
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
# À VÉRIFIER sur une vraie installation : emplacement et format des fichiers de session.
# Hypothèse (Codex 0.1xx) : $CODEX_HOME/sessions/AAAA/MM/JJ/rollout-<date>-<uuid>.jsonl, première ligne
#   {"timestamp": …, "type": "session_meta", "payload": {"id": "<uuid>", "cwd": "/chemin", "timestamp": …}}
# puis des lignes {"type": "response_item" | "event_msg", "payload": {…}}. Les anciennes versions mettaient
# {"id", "timestamp", …} directement sur la première ligne, sans cwd : ces sessions-là sont ignorées.
# Au moindre doute (pas de cwd, JSON illisible), la session n'est pas listée.

UUID_TAIL_RE = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$", re.I)
MAX_FILES = 400  # sessions les plus récentes examinées


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
    """(id, cwd, horodatage) lus dans les premières lignes du fichier, ou None."""
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
                        return sid, str(d["cwd"]), d.get("timestamp") or e.get("timestamp") or ""
    except OSError:
        return None
    return None


def _same_dir(a, b):
    try:
        return Path(a).resolve() == Path(b).resolve()
    except (OSError, ValueError):
        return False


def _user_text(payload):
    """Texte d'un message de l'utilisateur, ou "" (contexte injecté par Codex : <environment_context>…)."""
    if not isinstance(payload, dict):
        return ""
    if payload.get("type") == "user_message":
        text = str(payload.get("message") or "")
    elif payload.get("type") == "message" and payload.get("role") == "user":
        text = " ".join(str(c.get("text") or "") for c in payload.get("content") or [] if isinstance(c, dict))
    else:
        return ""
    text = text.strip()
    return "" if text.startswith("<") else text


def _messages(f):
    """Messages d'un fichier de session : utilisateur, Codex, outils. Les doublons event_msg / response_item
    (le même message existe sous les deux formes) sont évités en ne gardant que les event_msg s'il y en a."""
    events, items = [], []
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
                if t == "user_message":
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
                        text = " ".join(str(c.get("text") or "") for c in p.get("content") or []
                                        if isinstance(c, dict)).strip()
                        if text:
                            items.append({"role": "assistant", "text": text[:8000], "when": when})
                elif t in ("function_call", "local_shell_call", "custom_tool_call"):
                    detail = p.get("arguments") or p.get("input") or (p.get("action") or {}).get("command") or ""
                    if not isinstance(detail, str):
                        detail = json.dumps(detail, ensure_ascii=False)
                    items.append({"role": "tool", "text": str(p.get("name") or t), "detail": detail.replace("\n", " ")[:200],
                                  "when": when})
    if events:
        # outils (seulement dans les response_item) + messages des event_msg, dans l'ordre chronologique
        tools = [m for m in items if m["role"] == "tool"]
        return sorted(events + tools, key=lambda m: m["when"])
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
                    "prompts": len(users), "size": st.st_size, "agent": "codex"})
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
    return {"id": sid, "title": "", "messages": msgs[-limit:], "total": len(msgs), "agent": "codex"}
