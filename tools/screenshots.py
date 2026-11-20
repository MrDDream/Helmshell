#!/usr/bin/env python3
"""Captures d'écran du site, prises dans la démo avec Chrome sans affichage.

Utilisé par le workflow GitHub Pages après tools/build_site.py : sert _site/ sous /Helmshell/,
photographie chaque vue en clair et en sombre, et écrit les PNG dans _site/screens/.

    python3 tools/screenshots.py [--chrome /chemin/vers/chrome] [--lang en]
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site" / "screens"
PORT = 8799

# nom : (paramètres en plus et route de la démo, largeur, hauteur, échelle)
DESKTOP = (1440, 900, 1)
MOBILE = (390, 844, 2)
SHOTS = {
    "home": ("#/", *DESKTOP),
    "project": ("#/projets/atlas-web", *DESKTOP),
    "agents": ("#/sessions", *DESKTOP),
    "git": ("#/projets/atlas-web/git", *DESKTOP),
    "deploy": ("#/deploiements", *DESKTOP),
    "settings": ("&stab=apparence#/parametres", *DESKTOP),
    "mobile-home": ("#/", *MOBILE),
    "mobile-agents": ("#/sessions", *MOBILE),
}


def find_chrome(given):
    for c in (given, os.environ.get("CHROME"), "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        if c and shutil.which(c):
            return shutil.which(c)
    sys.exit("screenshots : Chrome introuvable (--chrome ou variable CHROME)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome")
    ap.add_argument("--lang", default="en")
    args = ap.parse_args()
    chrome = find_chrome(args.chrome)
    if not (ROOT / "_site" / "demo" / "index.html").exists():
        sys.exit("screenshots : lance d'abord tools/build_site.py")
    server = subprocess.Popen([sys.executable, str(ROOT / "tools" / "build_site.py"), "--serve", str(PORT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{PORT}/Helmshell/demo/"
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(base, timeout=1)
                break
            except OSError:
                time.sleep(0.2)
        else:
            sys.exit("screenshots : le serveur local ne répond pas")
        OUT.mkdir(parents=True, exist_ok=True)  # après le démarrage : --serve reconstruit _site/
        failed = []
        for name, (route, w, h, scale) in SHOTS.items():
            for theme in ("light", "dark"):
                dest = OUT / f"{name}-{theme}.png"
                url = f"{base}?lang={args.lang}&theme={theme}&shot=1{route}"
                with tempfile.TemporaryDirectory() as profile:
                    # Profil neuf à chaque vue ; bac à sable désactivé : page locale et statique, et le
                    # bac à sable de Chrome ne démarre pas sur les exécuteurs Ubuntu récents.
                    proc = subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                                    "--no-first-run", "--disable-extensions", f"--user-data-dir={profile}",
                                    f"--window-size={w},{h}", f"--force-device-scale-factor={scale}",
                                    "--virtual-time-budget=12000", f"--screenshot={dest}", url],
                                   capture_output=True, text=True, timeout=120, check=False)
                ok = dest.exists() and dest.stat().st_size > 10_000
                print("ok " if ok else "ÉCHEC", dest.name, f"{w}x{h}@{scale}")
                if not ok:
                    failed.append(dest.name)
                    print(proc.stderr[-1500:])
        if failed:
            sys.exit(f"screenshots : {len(failed)} capture(s) en échec")
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
