"""Branches en parallèle : une copie de travail (worktree Git) par branche.

Les copies vivent hors du dossier du projet, dans ~/projets/.branches/<projet>/<branche>
(dossier caché : Helmshell ne le prend pas pour un projet). Elles partagent le dépôt Git du
dossier principal (historique, commits, branches) mais ont chacune leurs fichiers : deux
sessions Claude peuvent ainsi travailler en même temps sur deux branches.

Rien n'est jamais supprimé sur le dépôt distant (GitHub…).
"""
import re
import shutil

from . import config
from .i18n import _
from .util import ApiError, log_activity

BASE = ".branches"


def base_dir(slug):
    from . import projects
    return projects.root() / BASE / slug


def safe(branch):
    """Nom de dossier / de session tmux pour une branche (« feat/x » -> « feat_x »)."""
    return re.sub(r"[^A-Za-z0-9_-]", "_", branch)


def check_name(p, branch):
    from . import projects
    branch = (branch or "").strip()
    if (not projects.BRANCH_RE.match(branch) or ".." in branch
            or any(part.startswith("-") or not part for part in branch.split("/"))
            or projects.git(p, "check-ref-format", "--branch", branch)[0] != 0):
        raise ApiError(_("Nom de branche invalide"))
    return branch


def _raw(slug):
    """Copies de travail du projet d'après `git worktree list` : [{branch, path}]."""
    from . import projects
    p = projects.project_dir(slug)
    if not (p / ".git").exists():
        return []
    code, out = projects.git(p, "worktree", "list", "--porcelain")
    if code != 0:
        return []
    base = str(base_dir(slug)) + "/"
    items, cur = [], {}
    for line in out.splitlines() + [""]:
        if not line:
            if cur.get("path", "").startswith(base):
                items.append(cur)
            cur = {}
        elif line.startswith("worktree "):
            cur["path"] = line[9:]
        elif line.startswith("branch refs/heads/"):
            cur["branch"] = line[18:]
        elif line == "detached":
            cur["detached"] = True
        elif line.startswith("prunable"):
            cur["prunable"] = True
    return [x for x in items if x.get("branch") and not x.get("prunable")]


def path_of(slug, branch):
    """Dossier de la copie d'une branche (404 si elle n'existe pas)."""
    from pathlib import Path
    for x in _raw(slug):
        if x["branch"] == branch:
            return Path(x["path"])
    raise ApiError(_("Pas de copie de travail pour la branche {branch}", branch=branch), 404)


def names(slug):
    return [x["branch"] for x in _raw(slug)]


def list_copies(slug):
    """Copies avec leur état : fichiers modifiés, commits d'avance / de retard sur le dossier principal."""
    from . import claude, projects
    p = projects.project_dir(slug)
    main = projects.current_branch(p)
    out = []
    for x in _raw(slug):
        b = x["branch"]
        code, st = projects.git(x["path"], "status", "--porcelain", strip=False)
        changes = len([l for l in st.splitlines() if l.strip()]) if code == 0 else 0
        ahead = behind = 0
        if main:
            code, cnt = projects.git(p, "rev-list", "--left-right", "--count", f"{main}...{b}")
            if code == 0 and len(cnt.split()) == 2:
                behind, ahead = (int(n) for n in cnt.split())
        code, last = projects.git(x["path"], "log", "-1", "--format=%ct\t%s")
        when, subject = (last.split("\t", 1) + [""])[:2] if code == 0 and last else ("0", "")
        st = claude.repo_state(slug, b)
        cx = claude.repo_state(slug, b, agent="codex")
        out.append({"branch": b, "path": x["path"], "changes": changes, "ahead": ahead, "behind": behind,
                    "base": main, "when": int(when) if when.isdigit() else 0, "subject": subject,
                    "session": st["exists"], "claude": st["claude"], "status": st.get("status", ""),
                    "tmux": st["name"], "codex_session": cx["exists"], "codex": cx["alive"],
                    "codex_tmux": cx["name"], "codex_status": cx.get("status", "")})
    return out


def create(slug, branch, base=None):
    """Crée la copie d'une branche (nouvelle, locale existante ou distante)."""
    from . import projects
    p = projects.project_dir(slug)
    if not (p / ".git").exists():
        raise ApiError(_("Ce projet n'a pas de dépôt Git"))
    if projects.git(p, "rev-parse", "--verify", "-q", "HEAD")[0] != 0:
        raise ApiError(_("Le dépôt n'a encore aucun commit : fais-en un avant de créer une branche"))
    branch = check_name(p, branch)
    if branch == projects.current_branch(p):
        raise ApiError(_("{branch} est la branche du dossier principal", branch=branch))
    if branch in names(slug):
        raise ApiError(_("La branche {branch} a déjà sa copie", branch=branch))
    dest = base_dir(slug) / safe(branch)
    if dest.exists():
        raise ApiError(_("Le dossier {path} existe déjà", path=dest))
    dest.parent.mkdir(parents=True, exist_ok=True)
    projects.git(p, "worktree", "prune")
    local = projects.git(p, "show-ref", "--verify", "-q", f"refs/heads/{branch}")[0] == 0
    remote = projects.git(p, "show-ref", "--verify", "-q", f"refs/remotes/origin/{branch}")[0] == 0
    if local:
        code, out = projects.git(p, "worktree", "add", str(dest), branch)
    elif remote:
        code, out = projects.git(p, "worktree", "add", "--track", "-b", branch, str(dest), f"origin/{branch}")
    else:
        start = "HEAD"
        if base:
            base = check_name(p, base)
            if projects.git(p, "rev-parse", "--verify", "-q", base)[0] != 0:
                raise ApiError(_("Branche de départ inconnue : {branch}", branch=base))
            start = base
        code, out = projects.git(p, "worktree", "add", "-b", branch, str(dest), start)
    if code != 0:
        raise ApiError(out)
    projects.invalidate_sizes()
    meta = config.project_meta(slug)
    log_activity(_("{name} : copie de travail pour la branche {branch}", name=meta.get("name") or slug, branch=branch),
                 "git", slug)
    return {"branch": branch, "path": str(dest), "existing": local or remote}


def merge(slug, branch):
    """Fusionne la branche dans celle du dossier principal. En cas de conflit, rien n'est modifié."""
    from . import projects
    p = projects.project_dir(slug)
    wt = path_of(slug, branch)
    main = projects.current_branch(p)
    if not main:
        raise ApiError(_("Le dossier principal n'est sur aucune branche"))
    code, st = projects.git(wt, "status", "--porcelain", "--untracked-files=no")
    if code == 0 and st.strip():
        n = len(st.splitlines())
        raise ApiError(_("La copie de {branch} a {n} fichier(s) modifié(s) non validé(s) : valide-les "
                         "(ou demande à Claude de le faire) avant de fusionner", branch=branch, n=n), 409)
    code, st = projects.git(p, "status", "--porcelain", "--untracked-files=no")
    if code == 0 and st.strip():
        raise ApiError(_("Le dossier principal ({branch}) a des modifications non validées : "
                         "valide-les ou mets-les de côté avant de fusionner", branch=main), 409)
    code, out = projects.git(p, "merge", "--no-edit", branch, timeout=120)
    if code != 0:
        _x, files = projects.git(p, "diff", "--name-only", "--diff-filter=U")
        projects.git(p, "merge", "--abort")
        if files.strip():
            raise ApiError(_("Conflits sur {files} : rien n'a été modifié. Demande à Claude, dans la branche "
                             "{branch}, de fusionner {main} et de régler les conflits, puis recommence.",
                             files=", ".join(files.split()[:6]), branch=branch, main=main), 409)
        raise ApiError(out)
    meta = config.project_meta(slug)
    log_activity(_("{name} : branche {branch} fusionnée dans {main}", name=meta.get("name") or slug, branch=branch,
                   main=main), "git", slug)
    return {"output": out, "into": main}


def remove(slug, branch, delete_branch=False, force=False):
    """Supprime la copie (et, sur demande, la branche locale si elle est fusionnée). Jamais sur le distant."""
    from . import claude, projects
    p = projects.project_dir(slug)
    wt = path_of(slug, branch)
    code, st = projects.git(wt, "status", "--porcelain")
    if code == 0 and st.strip() and not force:
        raise ApiError(_("La copie de {branch} a {n} fichier(s) modifié(s) non validé(s)", branch=branch,
                         n=len(st.splitlines())), 409)
    claude.repo_kill_all(slug, branch)
    args = ["worktree", "remove"] + (["--force"] if force else []) + [str(wt)]
    code, out = projects.git(p, *args)
    if code != 0:
        raise ApiError(out)
    kept = ""
    if delete_branch:
        code, out = projects.git(p, "branch", "-d", branch)
        if code != 0:
            kept = _("pas encore fusionnée : la branche est gardée")
    try:
        base_dir(slug).rmdir()  # plus aucune copie
    except OSError:
        pass
    projects.invalidate_sizes()
    meta = config.project_meta(slug)
    if delete_branch and not kept:
        text = _("{name} : copie de la branche {branch} supprimée (branche supprimée)", name=meta.get("name") or slug,
                 branch=branch)
    else:
        text = _("{name} : copie de la branche {branch} supprimée", name=meta.get("name") or slug, branch=branch)
    log_activity(text, "stop", slug)
    return {"deleted_branch": delete_branch and not kept, "note": kept}


def kill_sessions(slug):
    from . import claude
    for b in names(slug):
        claude.repo_kill_all(slug, b, log=False)


def move_all(slug, dest):
    """Corbeille : déplace toutes les copies du projet avec lui."""
    src = base_dir(slug)
    if src.is_dir():
        shutil.move(str(src), str(dest))


def restore_all(slug, src):
    if src.is_dir() and not base_dir(slug).exists():
        base_dir(slug).parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(base_dir(slug)))
