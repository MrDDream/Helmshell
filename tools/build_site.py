#!/usr/bin/env python3
"""Assemble le site GitHub Pages de Helmshell dans _site/ (bibliothèque standard uniquement).

    python3 tools/build_site.py              # construit _site/
    python3 tools/build_site.py --serve 8791 # construit puis sert _site/ sous /Helmshell/ (comme GitHub Pages)

_site/        = copie de site/ (page d'accueil, captures…)
_site/demo/   = interface réelle (static/, non modifiée) + site/demo/ (shim et données fictives) :
                - les chemins absolus (/app.css, /logos/…) deviennent relatifs, car la démo est servie
                  sous https://<compte>.github.io/Helmshell/demo/ ;
                - demo-data.js et demo-shim.js sont chargés avant tout le reste : ils répondent aux appels
                  /api/… à la place du serveur (aucun backend).
Le script échoue si une référence absolue vers un fichier statique subsiste (hors /api/…, gérées par le shim).
"""
import argparse
import functools
import http.server
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
SITE = ROOT / "site"
OUT = ROOT / "_site"
DEMO = OUT / "demo"
PREFIX = "/Helmshell"

TEXT_EXT = {".html", ".css", ".js", ".json", ".webmanifest", ".svg", ".txt"}
REWRITE_EXT = {".html", ".css", ".js"}
# Scripts de la démo, chargés (dans cet ordre) avant theme-init.js et app.js
SHIM_SCRIPTS = ["demo-data.js", "demo-shim.js"]
# Références absolues qui ne désignent pas un fichier statique et que le shim prend en charge
ALLOWED_ABS = ("/api/", "/auth/oidc/", "/hook/")


def fail(msg):
    print(f"build_site: ERREUR : {msg}", file=sys.stderr)
    sys.exit(1)


def version():
    try:
        return (ROOT / "VERSION").read_text().strip() or "0.0.0"
    except OSError:
        return "0.0.0"


def static_names():
    """Entrées de premier niveau de static/ (fichiers et dossiers) + fichiers générés pour la démo."""
    names = {p.name for p in STATIC.iterdir() if not p.name.startswith(".")}
    names.add("manifest.webmanifest")
    return names


def rewrite_text(text, names):
    """« /app.css », '/logos/x.svg', `/vendor/`, url(/fonts/…) → chemins relatifs à la page de la démo."""
    alt = "|".join(sorted((re.escape(n) for n in names), key=len, reverse=True))
    rx = re.compile(r"""(["'`(])/(?=(?:""" + alt + r""")(?:[/"'`?#)\s]|$))""")
    return rx.sub(r"\1", text)


def check_text(rel, text):
    """Références absolues restantes (hors /api/… et autres routes gérées par le shim) : liste des problèmes."""
    problems = []
    for m in re.finditer(r"""(?:["'`]|url\()/(?![/*])([A-Za-z@_][\w.@-]*)""", text):
        start = m.end(0) - len(m.group(1)) - 1
        rest = text[start:start + 40]
        if rest.startswith(ALLOWED_ABS):
            continue
        # Commentaires (// … ou /* … */ sur la même ligne) et expressions régulières littérales : ignorés
        line_start = text.rfind("\n", 0, start) + 1
        line = text[line_start:text.find("\n", start) if text.find("\n", start) != -1 else len(text)]
        before = text[line_start:start]
        if "//" in before.replace("://", "") or before.lstrip().startswith(("*", "/*", "<!--")):
            continue
        if re.search(r"/\^?\\?/?\($", before) or re.search(r"\.(test|match|replace)\($", before.rstrip()):
            continue
        problems.append(f"{rel}: {line.strip()[:160]}")
    return problems


def copy_tree(src, dst):
    for p in sorted(src.rglob("*")):
        if p.is_dir() or "__pycache__" in p.parts:
            continue
        target = dst / p.relative_to(src)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)


def manifest():
    """Équivalent statique du manifeste servi par server.py (chemins relatifs à la démo)."""
    return {
        "id": "./", "name": "Helmshell demo", "short_name": "Helmshell",
        "description": "Helmshell demo with sample data",
        "dir": "ltr", "start_url": "./", "scope": "./", "display": "standalone",
        "background_color": "#F4FBF8", "theme_color": "#F4FBF8",
        "icons": [
            {"src": "icone-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icone-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "icone-masquable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            {"src": "logo.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
        ],
    }


PLACEHOLDER = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Helmshell</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#F4FBF8;color:#161D1B}
main{text-align:center;padding:16px}a{color:#006A60;font-weight:600}</style></head>
<body><main><h1>Helmshell</h1><p>Self-hosted web console for your server, projects and coding agents.</p>
<p><a href="demo/">Open the live demo</a> · <a href="https://github.com/MrDDream/Helmshell">GitHub</a></p></main></body></html>
"""


def build():
    if not STATIC.is_dir():
        fail("dossier static/ introuvable")
    for f in SHIM_SCRIPTS:
        if not (SITE / "demo" / f).is_file():
            fail(f"site/demo/{f} manquant")
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    # 1. Le site (page d'accueil d'un autre chantier : peut ne pas exister encore)
    if SITE.is_dir():
        copy_tree(SITE, OUT)
    if not (OUT / "index.html").exists():
        (OUT / "index.html").write_text(PLACEHOLDER, encoding="utf-8")
        print("build_site: site/index.html absent : page d'accueil provisoire générée")
    # 2. L'interface réelle, telle quelle, dans demo/
    DEMO.mkdir(exist_ok=True)
    copy_tree(STATIC, DEMO)
    for part in DEMO.glob("locales/en.part*.json"):  # morceaux de travail, déjà fusionnés dans en.json
        part.unlink()
    (DEMO / "manifest.webmanifest").write_text(json.dumps(manifest(), indent=2), encoding="utf-8")
    # 3. Chemins absolus → relatifs (fichiers venus de static/ seulement)
    names = static_names()
    problems = []
    rewritten = 0
    for p in sorted(STATIC.rglob("*")):
        if p.is_dir() or p.suffix not in REWRITE_EXT or "vendor" in p.relative_to(STATIC).parts[:1]:
            continue
        rel = p.relative_to(STATIC)
        target = DEMO / rel
        text = target.read_text(encoding="utf-8")
        new = rewrite_text(text, names)
        if new != text:
            rewritten += 1
            target.write_text(new, encoding="utf-8")
        problems += check_text(f"demo/{rel}", new)
    # 4. Shim chargé en premier (scripts classiques, synchrones, avant theme-init.js et app.js)
    index = DEMO / "index.html"
    html = index.read_text(encoding="utf-8")
    tags = "".join(f'<script src="{f}"></script>' for f in SHIM_SCRIPTS)
    html, n = re.subn(r'(<meta charset="utf-8">)', r"\1\n" + tags, html, count=1)
    if n != 1:
        fail("balise <meta charset> introuvable dans index.html : impossible d'injecter le shim")
    html = html.replace("<title>Helmshell</title>", "<title>Helmshell · Demo</title>")
    index.write_text(html, encoding="utf-8")
    if html.index("demo-shim.js") > html.index("theme-init.js") or html.index("demo-shim.js") > html.index("app.js"):
        fail("le shim doit être chargé avant theme-init.js et app.js")
    # 5. Version de Helmshell (affichée dans le pied de page de la démo)
    shim = DEMO / "demo-shim.js"
    shim.write_text(shim.read_text(encoding="utf-8").replace("__HELMSHELL_VERSION__", version()), encoding="utf-8")
    (OUT / ".nojekyll").write_text("")
    if problems:
        fail("références absolues restantes (elles casseraient sous /Helmshell/demo/) :\n  " + "\n  ".join(problems))
    files = sum(1 for p in OUT.rglob("*") if p.is_file())
    print(f"build_site: {OUT.relative_to(ROOT)}/ prêt ({files} fichiers, {rewritten} fichiers réécrits, version {version()})")


class PagesHandler(http.server.SimpleHTTPRequestHandler):
    """Sert _site/ sous /Helmshell/ comme GitHub Pages (le reste : 404, pour repérer les chemins absolus)."""
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
                      ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".wasm": "application/wasm"}

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean == PREFIX or not clean.startswith(PREFIX + "/"):
            return str(OUT / "__absent__")
        return super().translate_path(clean[len(PREFIX):] or "/")

    def do_GET(self):
        clean = self.path.split("?", 1)[0]
        if clean in ("/", PREFIX):
            self.send_response(301)
            self.send_header("Location", PREFIX + "/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get("BUILD_SITE_LOG"):
            super().log_message(fmt, *args)


def serve(port):
    handler = functools.partial(PagesHandler, directory=str(OUT))
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"build_site: http://0.0.0.0:{port}{PREFIX}/ (démo : {PREFIX}/demo/) — Ctrl C pour arrêter", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--serve", type=int, metavar="PORT", help="sert _site/ sous /Helmshell/ après la construction")
    args = ap.parse_args()
    build()
    if args.serve:
        serve(args.serve)


if __name__ == "__main__":
    main()
