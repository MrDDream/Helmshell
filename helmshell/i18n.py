"""Textes du serveur en anglais (défaut) ou en français, selon le réglage « language ».

Même convention que l'interface (static/i18n.js) : le texte source est le français et sert de clé.
_(« Texte français {nom} », nom=valeur) renvoie la traduction anglaise de helmshell/locales/en.json quand
la langue n'est pas le français, sinon le texte tel quel, puis remplace les {variables}.
Les clés doivent rester des chaînes littérales, premier argument de _() : tests/check_i18n.py les extrait.
"""
import json
import re
import sys
import threading
from pathlib import Path

from . import config

DICT_FILE = Path(__file__).resolve().parent / "locales" / "en.json"
_dict = None
_lock = threading.Lock()
_warned = set()
_VAR = re.compile(r"\{(\w+)\}")


def _load():
    global _dict
    if _dict is None:
        with _lock:
            if _dict is None:
                try:
                    data = json.loads(DICT_FILE.read_text(encoding="utf-8"))
                except (OSError, ValueError) as e:
                    print(f"[i18n] {DICT_FILE} unreadable ({e}): French text shown", file=sys.stderr, flush=True)
                    data = {}
                _dict = {k: v for k, v in data.items() if isinstance(v, str)} if isinstance(data, dict) else {}
    return _dict


def lang():
    """Langue des textes du serveur : 'fr' ou 'en' (défaut)."""
    try:
        return "fr" if config.get("language") == "fr" else "en"
    except Exception:  # noqa: BLE001 — configuration illisible : anglais
        return "en"


def fill(text, /, **values):
    """Remplace les {nom} connus ; les autres accolades restent telles quelles (jamais d'évaluation)."""
    if not values:
        return text
    return _VAR.sub(lambda m: str(values[m.group(1)]) if m.group(1) in values else m.group(0), text)


def _(key, /, **values):
    """Traduit `key` (texte français) dans la langue réglée et remplace les {variables}."""
    text = key
    if lang() != "fr":
        d = _load()
        if key in d:
            text = d[key]
        elif d and key not in _warned:
            _warned.add(key)
            print(f"[i18n] missing English text for: {key!r}", file=sys.stderr, flush=True)
    return fill(text, **values)


def tr(fr, en):
    """Choix direct entre deux textes (contenus générés longs, modèles de projet)."""
    return fr if lang() == "fr" else en


__all__ = ["_", "lang", "fill", "tr"]
