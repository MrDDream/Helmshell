#!/usr/bin/env python3
"""Bibliothèques du navigateur, hébergées par Helmshell lui-même (static/vendor/<paquet>@<version>/).

Plus de CDN au chargement : la CSP peut se limiter à 'self', et une compromission de jsDelivr ne touche
plus l'appli. Chaque archive vient du registre npm officiel et son empreinte (dist.integrity, SHA-512)
est vérifiée avant extraction. Pour changer de version : modifier PACKAGES, relancer, puis reporter la
version dans le code (VENDOR dans static/load.js).

    python3 tools/vendor.py
"""
import base64
import hashlib
import io
import json
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "vendor"
REGISTRY = "https://registry.npmjs.org/"

# paquet : (version, fichiers ou dossiers gardés, relatifs au paquet)
PACKAGES = {
    "marked": ("18.2.1", ["lib/marked.umd.js", "LICENSE.md"]),
    "dompurify": ("3.4.18", ["dist/purify.min.js", "LICENSE"]),
    "codemirror": ("5.65.21", ["lib/", "addon/", "mode/", "LICENSE"]),
    "@xterm/xterm": ("5.5.0", ["lib/xterm.js", "css/xterm.css", "LICENSE"]),
    "@xterm/addon-fit": ("0.10.0", ["lib/addon-fit.js", "LICENSE"]),
    "qrcode-generator": ("2.0.4", ["dist/qrcode.js", "LICENSE"]),
}
KEEP_EXT = (".js", ".css", ".md", "")


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "helmshell-vendor"}), timeout=60) as r:
        return r.read()


def wanted(rel, keep):
    for k in keep:
        if k.endswith("/") and rel.startswith(k) and rel.endswith((".js", ".css")) and "/test" not in rel:
            return True
        if rel == k:
            return True
    return "/" not in rel and rel.upper().startswith("LICEN")


def vendor(name, version, keep):
    meta = json.loads(fetch(f"{REGISTRY}{name.replace('/', '%2F')}/{version}"))
    tgz = fetch(meta["dist"]["tarball"])
    algo, _, b64 = meta["dist"]["integrity"].partition("-")
    if algo != "sha512" or hashlib.sha512(tgz).digest() != base64.b64decode(b64):
        raise SystemExit(f"Empreinte invalide pour {name}@{version} : archive refusée")
    dest = OUT / f"{name}@{version}"
    if dest.exists():
        shutil.rmtree(dest)
    n = 0
    with tarfile.open(fileobj=io.BytesIO(tgz), mode="r:gz") as tar:
        for m in tar.getmembers():
            if not m.isfile():
                continue
            rel = m.name.split("/", 1)[1] if "/" in m.name else m.name
            if ".." in rel.split("/") or rel.startswith("/") or not wanted(rel, keep):
                continue
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(tar.extractfile(m).read())
            n += 1
    if n == 0:
        raise SystemExit(f"{name}@{version} : aucun fichier extrait")
    return n


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    keep = {f"{n}@{v}" for n, (v, _) in PACKAGES.items()}
    for old in OUT.iterdir():  # anciennes versions
        if old.is_dir() and old.name.startswith("@"):
            for sub in old.iterdir():
                if f"{old.name}/{sub.name}" not in keep:
                    shutil.rmtree(sub)
        elif old.is_dir() and old.name not in keep:
            shutil.rmtree(old)
    for name, (version, files) in PACKAGES.items():
        print(f"ok {name}@{version} : {vendor(name, version, files)} fichier(s), empreinte vérifiée")
    (OUT / "VERSIONS.json").write_text(json.dumps({n: v for n, (v, _) in PACKAGES.items()}, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
