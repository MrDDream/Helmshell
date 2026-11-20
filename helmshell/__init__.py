"""Helmshell — console web pour piloter projets, dossiers et sessions Claude sur le serveur."""
from pathlib import Path


def _read_version():
    """Version de Helmshell : fichier VERSION à la racine du dépôt (0.0.0 s'il manque)."""
    try:
        return (Path(__file__).resolve().parent.parent / "VERSION").read_text().strip() or "0.0.0"
    except OSError:
        return "0.0.0"


__version__ = _read_version()
