"""Tâches confiées à un agent en arrière-plan (`claude -p` ou `codex exec`), une session tmux par tâche.

Chaque tâche écrit dans ~/.config/helmshell/taches/<id>.* :
  .json   description (projet, consigne, agent, mode, début)
  .prompt consigne envoyée sur l'entrée standard
  .jsonl  sortie de l'agent (Claude : --output-format stream-json ; Codex : exec --json)
  .code   code de sortie, écrit à la fin
"""
import json
import re
import secrets
import shlex
import time

from . import config
from .i18n import _
from .util import ApiError, child_env, log_activity, run, tmux_cmd

PREFIX = "tache-"
ID_RE = re.compile(r"^[0-9]{10}-[a-z0-9]{6}$")
MAX_PROMPT = 20_000


def task_dir():
    d = config.DATA_DIR / "taches"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _f(task_id, ext):
    if not ID_RE.match(task_id or ""):
        raise ApiError(_("Tâche inconnue"), 404)
    return task_dir() / f"{task_id}.{ext}"


def _tmux(*args):
    try:
        return run(tmux_cmd(*args), timeout=10)
    except ApiError as e:
        return 1, str(e)


def _running(task_id):
    return _tmux("has-session", "-t", "=" + PREFIX + task_id)[0] == 0


KINDS = {"", "clean-report", "clean"}  # nature de la tâche (nettoyage : rapport, puis nettoyage validé)


# Fichiers d'un dépôt qui font exécuter quelque chose à l'agent (hooks, serveurs MCP, commandes)
TRUST_FILES = (".claude/settings.json", ".claude/settings.local.json", ".mcp.json", ".codex/config.toml")


def check_trust(slug, p, trust=False):
    """`claude -p` ne demande pas si l'on fait confiance au dossier : les hooks et serveurs MCP qu'un dépôt
    déclare lui-même s'exécuteraient sans prévenir. On demande donc une fois, avant la première tâche."""
    found = [f for f in TRUST_FILES if (p / f).exists()]
    if not found or config.project_meta(slug).get("claude_trusted"):
        return
    if not trust:
        raise ApiError(_("Ce dépôt a sa propre configuration Claude ({files}) : ses hooks et "
                         "serveurs MCP s'exécuteront avec tes droits. Confirme que tu fais confiance à ce dépôt.",
                         files=", ".join(found)), 428)
    config.set_project_meta(slug, claude_trusted=True)


def start(slug, prompt, mode, kind="", trust=False, agent=None):
    """Lance une tâche. `agent` : "claude" (défaut, comme avant) ou "codex" ; mode vide = mode par défaut de l'agent."""
    from . import agents, codex, projects
    p = projects.project_dir(slug)
    agent = agent or "claude"
    ag = agents.get(agent)
    if agent != "claude":  # Claude absent : la tâche échoue et le dit dans son journal, comme avant
        agents.require(agent)
    check_trust(slug, p, trust)
    prompt = (prompt or "").strip()
    if not prompt:
        raise ApiError(_("Écris la consigne de la tâche"))
    if len(prompt) > MAX_PROMPT:
        raise ApiError(_("Consigne trop longue"))
    mode = agents.check_mode(agent, mode)
    if (kind or "") not in KINDS:
        raise ApiError(_("Type de tâche inconnu"))
    task_id = f"{int(time.time())}-{secrets.token_hex(3)}"
    meta = config.project_meta(slug)
    info = {"id": task_id, "slug": slug, "name": meta.get("name") or slug, "prompt": prompt,
            "agent": agent, "mode": mode, "kind": kind or "", "started": time.time()}
    _f(task_id, "json").write_text(json.dumps(info, ensure_ascii=False))
    _f(task_id, "prompt").write_text(prompt)
    if agent == "codex":
        cmd = codex.cmd_exec(p, mode)
    else:
        cmd = [config.get("claude_bin"), "-p", "--permission-mode", mode,
               "--output-format", "stream-json", "--verbose"]
    shell = (f"{shlex.join(cmd)} < {shlex.quote(str(_f(task_id, 'prompt')))} "
             f"> {shlex.quote(str(_f(task_id, 'jsonl')))} 2>&1; "
             f"echo $? > {shlex.quote(str(_f(task_id, 'code')))}")
    env = child_env()
    try:
        code, out = run(tmux_cmd("new-session", "-d", "-s", PREFIX + task_id, "-c", str(p),
                                 "-e", f"PATH={env['PATH']}", "bash", "-lc", shell), timeout=15)
        if code != 0:
            raise ApiError(_("Impossible de lancer la tâche : {error}", error=out))
    except ApiError:
        for ext in ("json", "prompt"):  # pas de tâche fantôme
            _f(task_id, ext).unlink(missing_ok=True)
        raise
    log_activity(_("Tâche confiée à {agent} sur {name} : {prompt}", agent="Codex" if agent == "codex" else "Claude",
                   name=info["name"], prompt=prompt.splitlines()[0][:60]), "claude", slug)
    return state(task_id)


_parsed = {}  # id -> (taille du journal, évènements, résultat) : on ne relit que si le journal a grandi


def _events(task_id, limit=400, agent="claude"):
    f = _f(task_id, "jsonl")
    if not f.exists():
        return [], None
    size = f.stat().st_size
    hit = _parsed.get(task_id)
    if not hit or hit[0] != size:
        events, result = _parse(f, agent)
        hit = _parsed[task_id] = (size, events, result)
    return hit[1][-limit:], hit[2]


def _parse(f, agent="claude"):
    """Résumé lisible de la sortie de l'agent (Claude : stream-json ; Codex : exec --json)."""
    if agent == "codex":
        from . import codex
        with open(f, encoding="utf-8", errors="replace") as fh:
            return codex.parse_exec(fh)
    events, result = [], None
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except ValueError:
                events.append({"k": "text", "t": line[:2000]})
                continue
            kind = e.get("type")
            if kind == "assistant":
                for block in (e.get("message") or {}).get("content") or []:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text" and block.get("text", "").strip():
                        events.append({"k": "text", "t": block["text"][:6000]})
                    elif block.get("type") == "tool_use":
                        events.append({"k": "tool", "name": block.get("name", ""),
                                       "detail": tool_detail(block.get("input") or {})})
            elif kind == "result":
                result = {"text": (e.get("result") or "")[:8000], "error": bool(e.get("is_error")),
                          "cost": e.get("total_cost_usd"), "turns": e.get("num_turns"),
                          "duration": (e.get("duration_ms") or 0) / 1000}
    return events[-400:], result


def tool_detail(inp):
    for key in ("file_path", "path", "command", "pattern", "url", "description", "query", "prompt"):
        v = inp.get(key)
        if isinstance(v, str) and v:
            return v.replace("\n", " ")[:200]
    return ""


def state(task_id, full=False):
    info = json.loads(_f(task_id, "json").read_text())
    info.setdefault("agent", "claude")  # tâches d'avant Codex
    code_f = _f(task_id, "code")
    running = not code_f.exists() and _running(task_id)
    info["running"] = running
    info["finished"] = None
    info["exit_code"] = None
    if code_f.exists():
        raw = code_f.read_text().strip()
        info["exit_code"] = int(raw) if raw.lstrip("-").isdigit() else raw
        info["finished"] = code_f.stat().st_mtime
    elif not running:
        info["exit_code"] = "interrompue"
        info["finished"] = info["started"]
    info["status"] = ("running" if running and not code_f.exists()
                      else "ok" if info["exit_code"] == 0 else "error")
    events, result = _events(task_id, 400 if full else 40, info["agent"])
    if result and result["error"] and info["status"] == "ok":
        info["status"] = "error"
    info["result"] = result
    last = next((e for e in reversed(events) if e["k"] in ("text", "tool")), None)
    info["last"] = (last["t"] if last["k"] == "text" else f"{last['name']} {last['detail']}")[:200] if last else ""
    if full:
        info["events"] = events
    return info


def list_tasks(slug=None, limit=20):
    out = []
    for f in sorted(task_dir().glob("*.json"), reverse=True):
        if not ID_RE.match(f.stem):
            continue
        if slug:
            try:
                if json.loads(f.read_text()).get("slug") != slug:
                    continue
            except ValueError:
                continue
        try:
            out.append(state(f.stem))
        except (ValueError, OSError):
            continue
        if len(out) >= limit:
            break
    return out


def stop(task_id):
    _f(task_id, "json")
    if _running(task_id):
        _tmux("kill-session", "-t", "=" + PREFIX + task_id)
        code_f = _f(task_id, "code")
        if not code_f.exists():
            code_f.write_text("arrêtée\n")


def delete(task_id):
    if _running(task_id):
        raise ApiError(_("Arrête la tâche avant de la supprimer"))
    _parsed.pop(task_id, None)
    for ext in ("json", "prompt", "jsonl", "code"):
        f = _f(task_id, ext)
        if f.exists():
            f.unlink()


def retry(task_id, trust=False):
    """Relance une tâche avec la même consigne et les mêmes permissions."""
    info = json.loads(_f(task_id, "json").read_text()) if _f(task_id, "json").exists() else None
    if not info:
        raise ApiError(_("Tâche inconnue"), 404)
    agent = info.get("agent") or "claude"
    mode = info.get("mode") or ("default" if agent == "claude" else "")
    return start(info["slug"], info["prompt"], mode, info.get("kind") or "", trust, agent)


def clear_finished():
    n = 0
    for f in list(task_dir().glob("*.json")):
        if ID_RE.match(f.stem) and not _running(f.stem) and _f(f.stem, "code").exists():
            delete(f.stem)
            n += 1
    return n
