#!/usr/bin/env python3
"""Logos des plateformes (static/logos/platform), depuis des sources à licence connue.

- Simple Icons (CC0 1.0 ; l'icône Android est sous CC BY 3.0, voir THIRD_PARTY.md), couleurs officielles
  du projet ;
- Devicon (MIT) pour Windows ; Tux (Linux) d'après Larry Ewing, créé avec The GIMP ;
- web.svg est un dessin propre à Helmshell (licence du projet).

    python3 tools/fetch_platform_logos.py
"""
import re
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "logos" / "platform"
SIMPLE = "https://cdn.jsdelivr.net/npm/simple-icons@16.38.0/icons/"
DEVICON = "https://cdn.jsdelivr.net/npm/devicon@2.18.0/icons/"

# fichier : (source, chemin, couleur pour les icônes monochromes de Simple Icons)
LOGOS = {
    "android.svg": (SIMPLE, "android.svg", "#3DDC84"),
    "apple.svg": (SIMPLE, "apple.svg", "#000000"),
    "discord.svg": (SIMPLE, "discord.svg", "#5865F2"),
    "telegram.svg": (SIMPLE, "telegram.svg", "#26A5E4"),
    "linux.svg": (SIMPLE, "linux.svg", "#000000"),   # silhouette de Tux, inversée en thème sombre
    "windows.svg": (DEVICON, "windows11/windows11-original.svg", None),
}

# Navigateur stylisé avec un globe : dessin original de Helmshell
WEB = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
       '<rect x="2" y="3" width="20" height="18" rx="3.5" fill="#2563EB"/>'
       '<rect x="3.8" y="7.6" width="16.4" height="11.6" rx="1.8" fill="#FFFFFF"/>'
       '<circle cx="5.6" cy="5.3" r="0.85" fill="#FFFFFF"/><circle cx="8" cy="5.3" r="0.85" fill="#FFFFFF"/>'
       '<g fill="none" stroke="#2563EB" stroke-width="1.2"><circle cx="12" cy="13.4" r="4.2"/>'
       '<path d="M7.8 13.4h8.4M12 9.2c-1.6 1.7-1.6 6.7 0 8.4M12 9.2c1.6 1.7 1.6 6.7 0 8.4"/></g></svg>\n')

SAFE = re.compile(r"<(script|foreignObject|iframe|image)\b|\son\w+\s*=|href\s*=\s*[\"']\s*javascript:", re.I)


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "helmshell-logos"}), timeout=30) as r:
        return r.read().decode()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.svg"):
        old.unlink()
    for name, (base, path, color) in LOGOS.items():
        svg = fetch(base + path)
        if SAFE.search(svg):
            raise SystemExit(f"{name} : contenu SVG refusé")
        svg = re.sub(r"<title>.*?</title>", "", svg, flags=re.S)
        if color:  # Simple Icons : une forme monochrome, on lui donne la couleur de la marque
            svg = svg.replace("<svg ", f'<svg fill="{color}" ', 1)
        (OUT / name).write_text(svg.strip() + "\n")
        print("ok", name, "←", base + path)
    (OUT / "web.svg").write_text(WEB)
    print("ok web.svg (dessin de Helmshell)")


if __name__ == "__main__":
    main()
