#!/usr/bin/env python3
"""Ligne d'état des sessions Claude lancées par Helmshell.

Claude Code appelle ce script à chaque rafraîchissement de sa ligne d'état, avec en entrée un JSON
(contexte, modèle et, après la première réponse, les limites du forfait : fenêtre de 5 h et de 7 jours).
Le script garde ces chiffres pour la page d'accueil de Helmshell et affiche une ligne d'état courte.
Bibliothèque standard uniquement : il tourne sur l'hôte, en dehors de Helmshell.
"""
import json
import os
import sys
import time
from pathlib import Path

DATA = Path(os.environ.get("HELMSHELL_DATA") or Path.home() / ".config" / "helmshell") / "usage"


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False))
    os.replace(tmp, path)


def french():
    """Langue de Helmshell (config.json du dossier de données) : français seulement s'il est choisi."""
    try:
        return json.loads((DATA.parent / "config.json").read_text()).get("language") == "fr"
    except (OSError, ValueError, AttributeError):
        return False


def pct(v, fr=False):
    if not isinstance(v, (int, float)):
        return "…"
    return f"{round(v)} %" if fr else f"{round(v)}%"


def main():
    try:
        d = json.load(sys.stdin)
    except ValueError:
        print("Claude")
        return
    now = time.time()
    sid = "".join(c for c in str(d.get("session_id") or "") if c.isalnum() or c == "-")[:80]
    ctx = d.get("context_window") or {}
    try:
        if sid:
            write(DATA / "sessions" / f"{sid}.json", {
                "t": now, "cwd": d.get("cwd") or (d.get("workspace") or {}).get("current_dir"),
                "model": (d.get("model") or {}).get("display_name"), "context": ctx,
                "name": d.get("session_name")})
        if d.get("rate_limits"):
            write(DATA / "limits.json", {"t": now, "rate_limits": d["rate_limits"]})
    except OSError:
        pass
    # Script autonome (lancé par Claude Code, hors de Helmshell) : pas de helmshell/i18n.py, deux libellés en dur
    fr = french()
    words = ("contexte", "session", "semaine") if fr else ("context", "session", "week")
    parts = [(d.get("model") or {}).get("display_name") or "Claude"]
    if ctx.get("used_percentage") is not None:
        parts.append(f"{words[0]} {pct(ctx['used_percentage'], fr)}")
    rl = d.get("rate_limits") or {}
    if (rl.get("five_hour") or {}).get("used_percentage") is not None:
        parts.append(f"{words[1]} {pct(rl['five_hour']['used_percentage'], fr)}")
    if (rl.get("seven_day") or {}).get("used_percentage") is not None:
        parts.append(f"{words[2]} {pct(rl['seven_day']['used_percentage'], fr)}")
    print(" · ".join(parts))


if __name__ == "__main__":
    main()
