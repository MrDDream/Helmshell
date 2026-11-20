"""Terminaux web : un PTY par onglet, attaché à une session tmux (le shell survit au navigateur).

Sortie envoyée en Server-Sent Events, entrée reçue en POST : pas besoin de WebSocket.
"""
import fcntl
import os
import re
import secrets
import struct
import subprocess
import termios
import threading
import time
from pathlib import Path

from . import config
from .i18n import _
from .util import ApiError, child_env, run, tmux_cmd, tmux_style, tmux_slug

BUFFER_MAX = 200_000
IDLE_KILL = 45  # secondes sans client avant de détacher le PTY

_terms = {}
_lock = threading.Lock()


class Term:
    def __init__(self, argv, cwd, cols, rows, title):
        self.id = secrets.token_urlsafe(12)
        self.title = title
        self.master, slave = os.openpty()
        self._resize_fd(self.master, cols, rows)
        env = child_env()
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"
        # setsid -c : nouvelle session avec ce PTY comme terminal de contrôle
        self.proc = subprocess.Popen(["setsid", "-c", *argv], cwd=cwd, env=env, stdin=slave,
                                     stdout=slave, stderr=slave, close_fds=True)
        os.close(slave)
        self.buf = bytearray()
        self.offset = 0          # nombre total d'octets produits
        self.closed = False
        self.clients = 0
        self.last_client = time.time()
        self.cond = threading.Condition()
        threading.Thread(target=self._reader, daemon=True).start()

    @staticmethod
    def _resize_fd(fd, cols, rows):
        cols = max(20, min(int(cols or 120), 500))
        rows = max(5, min(int(rows or 32), 200))
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def _reader(self):
        while True:
            try:
                data = os.read(self.master, 65536)
            except OSError:
                data = b""
            with self.cond:
                if not data:
                    self.closed = True
                    self.cond.notify_all()
                    break
                self.buf += data
                self.offset += len(data)
                if len(self.buf) > BUFFER_MAX:
                    del self.buf[: len(self.buf) - BUFFER_MAX]
                self.cond.notify_all()
        try:
            self.proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass

    def write(self, data):
        if self.closed:
            raise ApiError(_("Terminal fermé"), 410)
        os.write(self.master, data.encode())

    def resize(self, cols, rows):
        if not self.closed:
            self._resize_fd(self.master, cols, rows)

    def read_from(self, pos, timeout=15):
        """Renvoie (données, nouvelle position, fermé) à partir de `pos` (None = tout le tampon)."""
        with self.cond:
            start = self.offset - len(self.buf)
            if pos is None or pos < start:
                pos = start
            if pos >= self.offset and not self.closed:
                self.cond.wait(timeout)
            start = self.offset - len(self.buf)
            pos = max(pos, start)
            data = bytes(self.buf[pos - start:])
            return data, self.offset, self.closed and pos + len(data) >= self.offset

    def kill(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        try:
            os.close(self.master)
        except OSError:
            pass
        self.closed = True


def _session_argv(session, cwd):
    # -A : s'attache si la session existe déjà, sinon la crée
    return tmux_cmd("new-session", "-A", "-s", session, "-c", cwd)


NAME_RE = re.compile(r"^[\w.@-]{1,120}$")


def _tmux(*args):
    try:
        return run(tmux_cmd(*args), timeout=10)
    except ApiError as e:
        return 1, str(e)


def _exists(name):
    return _tmux("has-session", "-t", "=" + name)[0] == 0


def list_sessions():
    """Toutes les sessions tmux de Helmshell (sauf celles des tâches en arrière-plan)."""
    from . import claude, projects
    fmt = "\t".join(["#{session_name}", "#{session_created}", "#{session_attached}",
                      "#{pane_current_path}", "#{pane_current_command}"])
    code, out = _tmux("list-sessions", "-F", fmt)
    if code != 0:
        return []
    try:
        root = projects.root().resolve()
    except (ApiError, OSError):
        root = None
    repo_names = {}  # session tmux du dépôt -> (projet, agent)
    if root:
        for p in root.iterdir():
            if p.is_dir():
                for agent in claude.REPO_AGENTS:
                    repo_names[claude.repo_session(p.name, agent)] = (p.name, agent)
    items = []
    for line in out.splitlines():
        parts = line.split("\t")
        # tache-* : tâches de fond ; _* : session de garde qui maintient le serveur tmux en vie
        if len(parts) < 5 or parts[0].startswith(("tache-", "_")):
            continue
        name, created, attached, path, cmd = parts[:5]
        slug = None
        if root:
            try:
                rel = Path(path).resolve().relative_to(root)
                # Copie de travail d'une branche : ~/projets/.branches/<projet>/<branche>
                parts = rel.parts[1:] if rel.parts[:1] == (".branches",) else rel.parts
                slug = parts[0] if parts else None
            except (ValueError, OSError):
                slug = None
        agent = None
        if name.startswith(claude.PREFIX):
            kind, agent = "remote", "claude"
        elif name in repo_names:
            kind, (slug, agent) = "repo", repo_names[name]
        elif "@" in name and name.split("@", 1)[0] in repo_names:
            kind, (slug, agent) = "repo", repo_names[name.split("@", 1)[0]]
        else:
            kind = "shell"
        # `claude` (nom historique) : un agent tourne dans la session ; `agent` dit lequel
        items.append({"name": name, "created": int(created or 0), "attached": int(attached or 0),
                      "path": path, "command": cmd, "slug": slug, "kind": kind, "agent": agent,
                      "claude": kind == "remote" or (cmd not in claude.SHELLS and kind == "repo")})
    items.sort(key=lambda x: x["created"])
    return items


def new_session(slug=None):
    """Crée une nouvelle session shell (serveur ou projet) avec un nom libre. Renvoie le nom."""
    from . import projects
    if slug:
        cwd = projects.project_dir(slug)
        base = "helmshell-" + tmux_slug(slug)
    else:
        cwd = config.HOME
        base = "helmshell-serveur"
    name, i = base, 2
    while _exists(name):
        name, i = f"{base}-{i}", i + 1
    code, out = _tmux("new-session", "-d", "-s", name, "-c", str(cwd))
    if code != 0:
        raise ApiError(_("Impossible de créer la session tmux : {error}", error=out))
    return name


def kill_session(name):
    if not NAME_RE.match(name or "") or name.startswith("_") or not _exists(name):
        raise ApiError(_("Session inconnue"), 404)
    _tmux("kill-session", "-t", "=" + name)


def open_term(target, slug, cols, rows, name=None, branch=None, agent=None):
    from . import claude, projects
    if target == "session":
        if not NAME_RE.match(name or "") or not _exists(name):
            raise ApiError(_("Session tmux introuvable"), 404)
        argv = tmux_cmd("attach-session", "-t", "=" + name)
        cwd, title = str(config.HOME), name
    elif target == "repo":
        agent = agent or "claude"
        name = claude.repo_ensure(slug, branch=branch, agent=agent)
        argv = tmux_cmd("attach-session", "-t", "=" + name)
        cwd, title = str(claude._where(slug, branch, agent)[1]), name
    elif target == "claude":
        projects.project_dir(slug)
        if not claude.running(slug):
            raise ApiError(_("Aucune session Claude pour ce projet"), 404)
        argv = tmux_cmd("attach-session", "-t", "=" + claude.tmux_name(slug))
        cwd, title = str(projects.project_dir(slug)), f"Claude · {slug}"
    elif target == "project":
        p = projects.project_dir(slug)
        title = "helmshell-" + tmux_slug(slug)
        argv = _session_argv(title, str(p))
        cwd = str(p)
    else:
        title = "helmshell-serveur"
        argv = _session_argv(title, str(config.HOME))
        cwd = str(config.HOME)
    tmux_style()
    t = Term(argv, cwd, cols, rows, title)
    with _lock:
        _terms[t.id] = t
    return t


def get(term_id):
    t = _terms.get(term_id)
    if not t:
        raise ApiError(_("Terminal inconnu"), 404)
    return t


def close(term_id):
    with _lock:
        t = _terms.pop(term_id, None)
    if t:
        t.kill()


def _reaper():
    while True:
        time.sleep(10)
        now = time.time()
        for tid, t in list(_terms.items()):
            if (t.clients == 0 and now - t.last_client > IDLE_KILL) or (t.closed and t.clients == 0):
                close(tid)


threading.Thread(target=_reaper, daemon=True).start()
