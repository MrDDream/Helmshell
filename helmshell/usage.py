"""Utilisation de Claude (forfait et contexte, ligne d'état et /usage) et de Codex (account/rateLimits/read
et fichiers de session)."""
import json
import re
import time
from pathlib import Path

from . import config
from .i18n import _

FRESH_SESSION = 6 * 3600  # une session sans nouvelles depuis 6 h n'est plus montrée


def _dir():
    return config.DATA_DIR / "usage"


def _read(f):
    try:
        return json.loads(f.read_text())
    except (OSError, ValueError):
        return None


def session_context(sid):
    """Contexte utilisé par une session Claude (relevé de la ligne d'état) → {used, size, tokens} ou None."""
    if not sid or "/" in str(sid):
        return None
    ctx = (_read(_dir() / "sessions" / f"{sid}.json") or {}).get("context") or {}
    used, size = ctx.get("used_percentage"), ctx.get("context_window_size") or 0
    cur = ctx.get("current_usage")
    tokens = None
    if isinstance(cur, dict):  # jetons réellement dans la fenêtre au dernier tour
        tokens = sum(int(cur.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    if used is None:
        if not size:
            return None
        used = 0.0 if tokens is None else 100 * tokens / size   # session ouverte, pas encore d'échange
    if tokens is None and size:
        tokens = round(size * float(used) / 100)
    return {"used": float(used), "size": size, "tokens": tokens}


def _epoch(v):
    """resets_at : secondes (ou millisecondes) depuis 1970, ou date ISO."""
    if isinstance(v, (int, float)):
        return v / 1000 if v > 1e12 else v
    if isinstance(v, str) and v:
        from datetime import datetime
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


USAGE_LINE = re.compile(r"^\s*Current (session|week \(([^)]+)\)):\s*([\d.]+)%\s*used(?:\s*·\s*resets\s+(.+?))?\s*$", re.M)
_cli = {"t": 0, "running": False}
REFRESH = 180  # quand l'Accueil est ouvert : au plus une lecture de /usage toutes les 3 min
USAGE_EVERY = (0, 2, 5, 10, 15, 30, 60)  # choix proposés dans les Paramètres (minutes)


def every(key="usage_every"):
    """Minutes entre deux lectures en tâche de fond (0 = seulement quand l'Accueil est ouvert).
    `key` : usage_every (Claude) ou codex_usage_every (Codex)."""
    try:
        v = int(config.get(key))
    except (TypeError, ValueError):
        return 5
    return v if v in USAGE_EVERY else 5


def _parse_reset(text, now=None):
    """« Nov 18, 6:20pm (UTC) » ou « Nov 21, 4am (Europe/Paris) » -> secondes depuis 1970."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    m = re.match(r"([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([^)]+)\))?", text.strip(), re.I)
    if not m:
        return None
    months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    try:
        month = months.index(m.group(1).lower()) + 1
        hour = int(m.group(3)) % 12 + (12 if (m.group(5) or "").lower() == "pm" else 0) if m.group(5) else int(m.group(3))
        tz = ZoneInfo(m.group(6)) if m.group(6) else ZoneInfo("UTC")
    except (ValueError, KeyError, Exception):  # noqa: BLE001 - fuseau inconnu
        return None
    now = now or time.time()
    year = datetime.fromtimestamp(now, tz).year
    for y in (year, year + 1):
        ts = datetime(y, month, int(m.group(2)), hour, int(m.group(4) or 0), tzinfo=tz).timestamp()
        if ts > now - 86400:
            return ts
    return None


def parse_usage(text):
    """Sortie de `claude -p /usage` -> rate_limits au format de la ligne d'état."""
    out = {}
    for m in USAGE_LINE.finditer(text or ""):
        kind, model, pct, reset = m.group(1), m.group(2), float(m.group(3)), m.group(4)
        if kind == "session":
            key = "five_hour"
        elif (model or "").lower() in ("all models", "tous les modèles"):
            key = "seven_day"
        else:
            key = "seven_day_" + re.sub(r"[^a-z0-9]+", "_", (model or "").lower()).strip("_")
        out[key] = {"used_percentage": pct, "resets_at": _parse_reset(reset) if reset else None}
    return out


def _refresh_cli():
    from .util import child_env, run
    try:
        code, text = run([config.get("claude_bin"), "-p", "/usage", "--output-format", "text", "--no-session-persistence"],
                         cwd=str(config.DATA_DIR), timeout=60, env=child_env())
        limits = parse_usage(text) if code == 0 else {}
        _cli["error"] = None if limits else _("code {code} : {output}", code=code, output=text[:300])
        if limits:
            f = _dir() / "limits.json"
            f.parent.mkdir(parents=True, exist_ok=True)
            tmp = f.with_suffix(".tmp")
            tmp.write_text(json.dumps({"t": time.time(), "rate_limits": limits, "source": "usage"}))
            tmp.replace(f)
    except Exception as e:  # noqa: BLE001 - fil d'arrière-plan : on garde la cause pour l'affichage
        _cli["error"] = repr(e)[:300]
    finally:
        _cli["running"] = False


def refresh(force=False, max_age=REFRESH):
    """Relit /usage en arrière-plan si les chiffres ont plus de `max_age` s.

    /usage est une commande locale de Claude Code : elle interroge le compte, sans requête au modèle,
    donc sans consommer de jetons ni de quota."""
    import threading
    lim = _read(_dir() / "limits.json") or {}
    if _cli["running"] or (not force and time.time() - max(lim.get("t", 0), _cli["t"]) < max_age):
        return
    _cli.update(running=True, t=time.time())
    threading.Thread(target=_refresh_cli, daemon=True).start()


def start_loop():
    """Lecture régulière en tâche de fond, même quand personne ne regarde l'Accueil."""
    import threading

    def loop():
        time.sleep(20)
        while True:
            try:
                n = every()
                if n:
                    refresh(max_age=n * 60 - 15)
            except Exception:  # noqa: BLE001 - la boucle ne doit jamais s'arrêter
                pass
            try:
                n = every("codex_usage_every")
                if n:
                    refresh_codex(max_age=n * 60 - 15)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(30)
    threading.Thread(target=loop, daemon=True, name="usage").start()


def summary():
    from . import projects
    out = {"limits": [], "updated": 0, "sessions": []}
    refresh()
    if _cli.get("error"):
        out["error"] = _cli["error"]
    out["refreshing"] = _cli["running"]
    out["every"] = every()
    lim = _read(_dir() / "limits.json")
    if lim and isinstance(lim.get("rate_limits"), dict):
        out["updated"] = lim.get("t", 0)
        labels = {"five_hour": ("session", _("Session (5 h)"), 5 * 3600),
                  "seven_day": ("week", _("Semaine · tous les modèles"), 7 * 86400),
                  "seven_day_opus": ("week_opus", _("Semaine · {model}", model="Opus"), 7 * 86400),
                  "seven_day_sonnet": ("week_sonnet", _("Semaine · {model}", model="Sonnet"), 7 * 86400)}
        for key, val in lim["rate_limits"].items():
            if not isinstance(val, dict) or val.get("used_percentage") is None:
                continue
            if key in labels:
                kid, label, window = labels[key]
            elif key.startswith("seven_day_"):
                kid, label, window = key, _("Semaine · {model}", model=key[10:].replace("_", " ").title()), 7 * 86400
            else:
                kid, label, window = key, key.replace("_", " "), 0
            out["limits"].append({"id": kid, "label": label, "used": float(val["used_percentage"]),
                                  "resets_at": _epoch(val.get("resets_at")), "window": window})
        order = [v[0] for v in labels.values()]
        out["limits"].sort(key=lambda x: order.index(x["id"]) if x["id"] in order else 99)
    try:
        root = projects.root().resolve()
    except OSError:
        root = None
    now = time.time()
    # Sessions ouvertes = fiches que Claude Code tient pour chaque processus (~/.claude/sessions/<pid>.json),
    # quelle que soit leur origine : Helmshell (tmux), terminal, app de bureau.
    live = []
    for f in (config.HOME / ".claude" / "sessions").glob("*.json"):
        d = _read(f)
        if d and d.get("sessionId"):
            live.append(d)
    live.sort(key=lambda d: d.get("updatedAt") or d.get("startedAt") or 0, reverse=True)
    for d in live[:20]:
        # « Ouvertes » : terminaux Claude (Helmshell dans tmux, ou un terminal). L'app de bureau garde ses
        # conversations en arrière-plan : on ne les montre que pendant qu'elles travaillent.
        if d.get("entrypoint") == "claude-desktop" and not d.get("tmux") and d.get("status") != "busy":
            continue
        sid = str(d["sessionId"])
        u = _read(_dir() / "sessions" / f"{sid}.json") if "/" not in sid else None
        cwd = d.get("cwd") or (u or {}).get("cwd") or ""
        slug = None
        if root and cwd:
            try:
                rel = Path(cwd).resolve().relative_to(root)
                slug = rel.parts[0] if rel.parts else None
            except (ValueError, OSError):
                slug = None
        meta = config.project_meta(slug) if slug else {}
        ctx = (u or {}).get("context") or {}
        size = ctx.get("context_window_size") or 0
        used = ctx.get("used_percentage")
        where = "Helmshell" if d.get("tmux") else {"claude-desktop": _("app de bureau"), "cli": _("terminal")}.get(d.get("entrypoint"), d.get("entrypoint") or "")
        out["sessions"].append({
            "id": sid, "slug": slug, "project": meta.get("name") or slug or Path(cwd).name or cwd,
            "session": d.get("name") or (u or {}).get("name") or "", "where": where, "status": d.get("status") or "",
            "model": (u or {}).get("model"), "used": float(used) if used is not None else None, "size": size,
            "tokens": round(size * float(used) / 100) if size and used is not None else None,
            "t": (u or {}).get("t") or (d.get("updatedAt") or 0) / 1000})
    # Ménage : relevés de sessions fermées depuis longtemps
    for f in (_dir() / "sessions").glob("*.json"):
        try:
            if now - f.stat().st_mtime > FRESH_SESSION and f.stem not in {x["id"] for x in out["sessions"]}:
                f.unlink(missing_ok=True)
        except OSError:
            pass
    return out


_cx = {"t": 0, "running": False, "error": None}


def _refresh_codex():
    from . import codex
    try:
        rl = codex.read_live_limits()
        f = _dir() / "codex_limits.json"
        f.parent.mkdir(parents=True, exist_ok=True)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps({"t": time.time(), "rate_limits": rl}))
        tmp.replace(f)
        _cx["error"] = None
    except Exception as e:  # noqa: BLE001 - fil d'arrière-plan : la cause est montrée dans la fenêtre
        _cx["error"] = str(e)[:300] or repr(e)[:300]
    finally:
        _cx["running"] = False


def refresh_codex(force=False, max_age=REFRESH):
    """Relit les limites de Codex en arrière-plan si elles ont plus de `max_age` s (Codex installé seulement)."""
    import threading
    from . import agents
    if not agents.AGENTS["codex"].available():
        return
    live = _read(_dir() / "codex_limits.json") or {}
    if _cx["running"] or (not force and time.time() - max(live.get("t", 0), _cx["t"]) < max_age):
        return
    _cx.update(running=True, t=time.time())
    threading.Thread(target=_refresh_codex, daemon=True).start()


def codex_summary():
    """Utilisation de Codex, même forme que summary() : limites du forfait (jointes par Codex à chaque échange,
    relues dans ses fichiers de session) et contexte des sessions Codex ouvertes dans les terminaux."""
    from . import claude, codex
    refresh_codex()
    # La plus récente des deux sources : lecture directe (account/rateLimits/read) ou dernier échange
    lim = codex.rate_limits() or {}
    live = _read(_dir() / "codex_limits.json") or {}
    if isinstance(live.get("rate_limits"), dict) and live.get("t", 0) >= lim.get("updated", 0):
        lim = codex._limits_out(live["rate_limits"], live["t"])
    out = {"limits": lim.get("limits", []), "plan": lim.get("plan", ""), "updated": lim.get("updated", 0),
           "refreshing": _cx["running"], "every": every("codex_usage_every"), "sessions": []}
    if _cx.get("error"):
        out["error"] = _cx["error"]
    for r in claude.list_repo_sessions(agent="codex"):
        if not r.get("alive"):
            continue
        try:
            st = claude.repo_state(r["slug"], r.get("branch"), "codex")
        except Exception:  # noqa: BLE001 — session fermée entre-temps
            continue
        ctx = st.get("context") or {}
        out["sessions"].append({"project": r["name"], "slug": r["slug"], "branch": r.get("branch"),
                                "used": ctx.get("used"), "tokens": ctx.get("tokens"), "size": ctx.get("size")})
    return out
