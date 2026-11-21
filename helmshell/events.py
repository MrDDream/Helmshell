"""État en direct (sessions Claude, tâches, santé du serveur) pour les pages ouvertes (Server-Sent Events)
et déclenchement des notifications quand une session demande quelque chose ou qu'une tâche se termine."""
import hashlib
import json
import secrets
import threading
import time
import traceback

from . import claude, notify, projects, system, tasks
from .i18n import _

INTERVAL = 2
_cond = threading.Condition()
_state = {"v": 0, "sessions": [], "repos": [], "tasks": [], "health": {}}
_busy_since = {}  # slug -> début de la période « travaille »
_prev = None  # dernier état connu pour détecter les transitions
_started = False


def question_hash(text):
    return hashlib.sha256((text or "").encode()).hexdigest()[:12]


def snapshot():
    with _cond:
        return json.loads(json.dumps(_state))


def wait(version, timeout):
    """Attend un nouvel état (version différente) ou la fin du délai ; renvoie l'état courant."""
    with _cond:
        _cond.wait_for(lambda: _state["v"] != version, timeout)
        return json.loads(json.dumps(_state))


def _notify_transitions(sessions, task_list, repos=()):
    global _prev
    cur = {"s": {s["slug"]: s for s in sessions}, "t": {t["id"]: t for t in task_list},
           "r": {r.get("key") or r["slug"]: r for r in repos}}
    if _prev is None:  # premier passage : on ne notifie pas ce qui existait déjà
        _prev = cur
        return
    base = notify.public_url()
    for slug, s in cur["s"].items():
        before = _prev["s"].get(slug, {})
        link = f"{base}/#/projets/{slug}" if base else ""
        if s.get("phase") == "question" and (before.get("phase") != "question"
                                              or before.get("question") != s.get("question")):
            actions = []
            if base:
                qid = secrets.token_hex(8)  # commun à Oui et Non : une seule réponse possible
                for label, v in ((_("Oui"), "y"), (_("Non"), "n")):
                    tok = notify.action_token(slug=slug, v=v, q=question_hash(s.get("question")),
                                              st=s.get("started"), n=qid)
                    actions.append({"action": "http", "label": label, "url": f"{base}/hook/answer?t={tok}",
                                    "method": "POST", "clear": True})
            notify.send(_("{name} : Claude attend une réponse", name=s["name"]),
                        s.get("question") or _("Confirmation demandée"),
                        click=link, actions=actions, priority=4, tags=["question"])
        elif s.get("phase") == "exited" and before.get("phase") != "exited":
            notify.send(_("{name} : Claude s'est arrêté", name=s["name"]),
                        _("Code de sortie {code}", code=s.get("exit_code")),
                        click=link, priority=3, tags=["warning"])
    # L'agent a fini de travailler dans le terminal d'un projet (busy -> idle) ; Codex attend une validation.
    # (Les questions de Claude passent par ses hooks, plus haut.)
    from . import config
    now = time.time()
    for key, r in cur["r"].items():
        before = _prev.get("r", {}).get(key, {})
        slug = key
        codex = (r.get("agent") or "claude") == "codex"
        who = "Codex" if codex else "Claude"
        click = (f"{base}/#/projets/{r['slug']}/claude?" + "&".join(
            ([f"branche={r['branch']}"] if r.get("branch") else []) + (["agent=codex"] if codex else []))).rstrip("?") \
            if base else ""
        if r.get("status") == "busy" and before.get("status") != "busy":
            _busy_since[slug] = now
        if (before.get("status") == "busy" and r.get("status") == "idle" and r.get("claude")
                and config.get("notify_done") is not False and now - (r.get("started") or now) > 60
                and now - _busy_since.pop(slug, now) >= 20):
            notify.send(_("{name} : {agent} a terminé", name=r["name"], agent=who),
                        _("{agent} attend la suite dans le terminal du projet.", agent=who),
                        click=click, tags=["white_check_mark"])
        if (codex and r.get("status") == "waiting" and r.get("claude")
                and (before.get("status") != "waiting" or before.get("question") != r.get("question"))):
            notify.send(_("{name} : Codex attend ta validation", name=r["name"]),
                        r.get("question") or _("Validation demandée"), click=click, priority=4, tags=["question"])
    for tid, t in cur["t"].items():
        before = _prev["t"].get(tid)
        if before and before.get("status") == "running" and t.get("status") != "running":
            ok = t["status"] == "ok"
            text = ((t.get("result") or {}).get("text") or t.get("last") or "")[:500]
            notify.send(_("{name} : tâche terminée", name=t["name"]) if ok
                        else _("{name} : tâche en échec", name=t["name"]),
                        text or t["prompt"][:200], click=f"{base}/#/projets/{t['slug']}/claude" if base else "",
                        tags=["white_check_mark" if ok else "x"])
    _prev = cur


def _loop():
    last_health = 0
    while True:
        try:
            sessions = claude.list_sessions()
            task_list = tasks.list_tasks(limit=15)
            repos = claude.list_repo_sessions()
            _notify_transitions(sessions, task_list, repos)
            new = {"sessions": sessions, "repos": repos,
                   "tasks": [dict(t, result=None, prompt=t["prompt"][:300]) for t in task_list]}
            now = time.time()
            with _cond:
                changed = json.dumps(new, sort_keys=True) != json.dumps(
                    {k: _state[k] for k in new}, sort_keys=True)
                if changed:
                    _state.update(new)
                if now - last_health >= 5:
                    _state["health"] = system.stats(str(projects.root()))
                    last_health = now
                    changed = True
                if changed:
                    _state["v"] += 1
                    _cond.notify_all()
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        time.sleep(INTERVAL)


def start():
    global _started
    if not _started:
        _started = True
        threading.Thread(target=_loop, daemon=True, name="helmshell-events").start()
