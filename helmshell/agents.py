"""Agents de code pris en charge : Claude Code et OpenAI Codex CLI, côte à côte.

On choisit l'agent par projet (session interactive) et par tâche. Chaque agent a ses modes de
permission ; les libellés sont donnés en français et en anglais pour l'interface.
"""
import os
import shutil

from . import config
from .i18n import _, lang
from .util import ApiError


def _resolvable(path):
    path = path or ""
    if not path:
        return False
    if os.sep in path:
        return os.path.isfile(path) and os.access(path, os.X_OK)
    return shutil.which(path) is not None


def _mode(id_, label_fr, label_en, hint_fr, hint_en):
    return {"id": id_, "label_fr": label_fr, "label_en": label_en, "hint_fr": hint_fr, "hint_en": hint_en}


def _localized(modes):
    """Modes servis à l'interface : label_fr/label_en/hint_fr/hint_en, plus label et hint dans la langue réglée."""
    suffix = "_fr" if lang() == "fr" else "_en"
    return [dict(m, label=m["label" + suffix], hint=m["hint" + suffix]) for m in modes]


class Claude:
    id = "claude"
    label = "Claude Code"
    _MODES = [
        _mode("default", "Demander à chaque action", "Ask before each action",
              "Tu valides chaque modification et commande", "You approve every edit and command"),
        _mode("acceptEdits", "Accepter les modifications", "Accept edits",
              "Fichiers modifiés librement, commandes validées", "Files are edited freely, commands need approval"),
        _mode("plan", "Plan d’abord", "Plan first",
              "Claude propose un plan avant de toucher au code", "Claude proposes a plan before touching the code"),
        _mode("auto", "Automatique", "Automatic",
              "Claude avance seul, avec des garde-fous de sécurité", "Claude works on its own, with safety guardrails"),
        _mode("dontAsk", "Ne rien demander", "Don't ask",
              "Refuse ce qui n’est pas déjà autorisé, sans poser de question",
              "Denies anything not already allowed, without asking"),
    ]

    def bin(self):
        return config.get("claude_bin")

    def available(self):
        return _resolvable(self.bin())

    def modes(self):
        return _localized(self._MODES)

    def mode_ids(self):
        from . import claude
        return claude.MODES

    def default_mode(self):
        from . import claude
        m = config.get("default_mode")
        return m if m in claude.MODES else "default"


class Codex:
    id = "codex"
    label = "Codex"
    _MODES = [
        _mode("read-only", "Lecture seule", "Read only",
              "Codex lit le projet et demande avant de modifier ou d’exécuter quoi que ce soit",
              "Codex reads the project and asks before editing or running anything"),
        _mode("auto", "Automatique", "Automatic",
              "Modifie et exécute dans le dossier du projet ; demande avant d’en sortir (réseau, autres dossiers)",
              "Edits and runs commands inside the project folder; asks before going further (network, other folders)"),
        _mode("full-access", "Accès complet", "Full access",
              "Ni bac à sable ni validation : Codex agit avec tous tes droits",
              "No sandbox, no approvals: Codex acts with all your permissions"),
    ]

    def bin(self):
        return config.get("codex_bin")

    def available(self):
        return _resolvable(self.bin())

    def modes(self):
        return _localized(self._MODES)

    def mode_ids(self):
        from . import codex
        return set(codex.MODES)

    def default_mode(self):
        from . import codex
        return codex.default_mode()


AGENTS = {"claude": Claude(), "codex": Codex()}


def get(agent_id):
    """Agent par son identifiant ("claude" si vide) ; erreur 400 si inconnu."""
    agent = AGENTS.get(agent_id or "claude")
    if not agent:
        raise ApiError(_("Agent inconnu"))
    return agent


def check_mode(agent_id, mode):
    """Mode de permission valide pour cet agent (mode vide = mode par défaut de l'agent)."""
    agent = get(agent_id)
    if not mode:
        return agent.default_mode()
    if mode not in agent.mode_ids():
        raise ApiError(_("Mode de permission inconnu"))
    return mode


def require(agent_id):
    """L'agent, s'il est installé ; sinon une erreur claire."""
    agent = get(agent_id)
    if not agent.available():
        raise ApiError(_("{label} n'est pas installé sur ce serveur (commande introuvable : {bin})",
                         label=agent.label, bin=agent.bin()))
    return agent


def default_agent():
    """Agent choisi dans les réglages s'il est installé, sinon le premier installé, sinon Claude."""
    wanted = config.get("default_agent") or ""
    if wanted in AGENTS and AGENTS[wanted].available():
        return wanted
    for aid, agent in AGENTS.items():
        if agent.available():
            return aid
    return "claude"


def public_info(recheck=False):
    out = {
        "default_agent": default_agent(),
        "setting": config.get("default_agent") or "",
        "agents": [{"id": a.id, "label": a.label, "available": a.available(), "bin": a.bin(),
                    "modes": a.modes(), "default_mode": a.default_mode()} for a in AGENTS.values()],
    }
    for a in out["agents"]:
        if a["id"] == "codex" and a["available"]:
            # Bac à sable de Codex utilisable sur l'hôte ? (sinon les modes Lecture seule et Automatique
            # refusent toutes les commandes)
            from . import codex
            a["sandbox"] = codex.sandbox_check(force=recheck)
    return out
