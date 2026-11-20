#!/usr/bin/env python3
"""Vérifie les traductions de l'interface (static/i18n.js) et du serveur (helmshell/i18n.py).

Interface : extrait les clés des appels t('…') et tp(n, '…', '…') de static/*.js (le texte français sert
de clé) et vérifie que chacune a sa traduction dans static/locales/en.json.
Serveur : extrait les clés des appels _("…") de server.py et helmshell/*.py (analyse syntaxique Python) et
vérifie que chacune a sa traduction dans helmshell/locales/en.json.

- clé absente de en.json : erreur (code de sortie 1) ;
- variables {nom} différentes entre une clé du serveur et sa traduction : erreur ;
- appel _() dont le premier argument n'est pas une chaîne littérale, ou sans valeur pour une {variable} : erreur ;
- entrée de en.json que le code n'utilise plus : simple avertissement ;
- appel t( / tp( dont le texte n'est pas une chaîne littérale entre apostrophes : avertissement.

    python3 tests/check_i18n.py                  # vérification (interface et serveur)
    python3 tests/check_i18n.py --keys           # clés de l'interface (JSON), sans vérifier
    python3 tests/check_i18n.py --server-keys    # clés du serveur (JSON), sans vérifier
"""
import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
DICT = STATIC / "locales" / "en.json"
SERVER_DICT = ROOT / "helmshell" / "locales" / "en.json"
SERVER_FILES = [ROOT / "server.py"] + sorted((ROOT / "helmshell").glob("*.py"))
VAR = re.compile(r"\{(\w+)\}")

STR = r"'((?:[^'\\\n]|\\.)*)'"
# t('…') : pas précédé d'un identifiant ni d'un point (set(, x.t( …)
T_CALL = re.compile(r"(?<![\w$.])t\(\s*" + STR)
# tp(n, '…', '…') : le premier argument s'arrête à la première virgule suivie d'une chaîne
TP_CALL = re.compile(r"(?<![\w$.])tp\(([^;'`]*?),\s*" + STR + r"\s*,\s*" + STR)
ANY_CALL = re.compile(r"(?<![\w$.])(tp?)\(")
ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}


def unescape(s):
    """Décode les échappements d'une chaîne JavaScript entre apostrophes."""
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c != "\\" or i + 1 >= len(s):
            out.append(c)
            i += 1
            continue
        n = s[i + 1]
        if n == "u" and s[i + 2:i + 3] == "{":
            j = s.index("}", i)
            out.append(chr(int(s[i + 3:j], 16)))
            i = j + 1
        elif n == "u":
            out.append(chr(int(s[i + 2:i + 6], 16)))
            i += 6
        elif n == "x":
            out.append(chr(int(s[i + 2:i + 4], 16)))
            i += 4
        elif n == "\n":  # continuation de ligne
            i += 2
        else:
            out.append(ESCAPES.get(n, n))
            i += 2
    return "".join(out)


def extract(files):
    """Renvoie ({clé: [fichier:ligne, …]}, [avertissements])."""
    keys, warnings = {}, []
    for f in files:
        src = f.read_text(encoding="utf-8")
        line_at = lambda pos: src.count("\n", 0, pos) + 1  # noqa: E731
        literal = set()
        for m in T_CALL.finditer(src):
            keys.setdefault(unescape(m.group(1)), []).append(f"{f.name}:{line_at(m.start())}")
            literal.add(m.start())
        for m in TP_CALL.finditer(src):
            for g in (2, 3):
                keys.setdefault(unescape(m.group(g)), []).append(f"{f.name}:{line_at(m.start())}")
            literal.add(m.start())
        if f.name == "i18n.js":  # définitions de t() et tp() elles-mêmes
            continue
        for m in ANY_CALL.finditer(src):
            if m.start() not in literal:
                warnings.append(f"{f.name}:{line_at(m.start())} : {m.group(1)}( sans texte littéral : "
                                f"{src[m.start():m.start() + 60].splitlines()[0]}")
    return keys, warnings


def extract_server(files):
    """Clés des appels _("…") du code Python → ({clé: [fichier:ligne, …]}, [erreurs])."""
    keys, errors = {}, []
    for f in files:
        rel = f.relative_to(ROOT)
        tree = ast.parse(f.read_text(encoding="utf-8"), filename=str(rel))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "_"):
                continue
            where = f"{rel}:{node.lineno}"
            first = node.args[0] if node.args else None
            if len(node.args) != 1 or not (isinstance(first, ast.Constant) and isinstance(first.value, str)):
                errors.append(f"{where} : _() attend une chaîne littérale seule en premier argument")
                continue
            key = first.value
            keys.setdefault(key, []).append(where)
            named = {k.arg for k in node.keywords}
            if None not in named:  # sans **valeurs : chaque {variable} doit être fournie
                absent = sorted(set(VAR.findall(key)) - named)
                if absent:
                    errors.append(f"{where} : valeur absente pour {', '.join(absent)} dans {key!r}")
    return keys, errors


def check_server():
    """Vérifie helmshell/locales/en.json ; renvoie le nombre d'erreurs."""
    keys, errors = extract_server(SERVER_FILES)
    try:
        en = json.loads(SERVER_DICT.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ÉCHEC : {SERVER_DICT.relative_to(ROOT)} introuvable (python3 tools/merge_locales.py)")
        return 1
    missing = sorted(k for k in keys if not isinstance(en.get(k), str))
    unused = sorted(k for k in en if k not in keys)
    for k, v in en.items():
        if isinstance(v, str) and set(VAR.findall(k)) != set(VAR.findall(v)):
            errors.append(f"helmshell/locales/en.json : variables différentes pour {k!r} → {v!r}")
    for k in unused:
        print(f"  inutilisée (serveur) : {k!r}")
    for e in errors:
        print(f"  ERREUR {e}")
    for k in missing:
        print(f"  MANQUANTE (serveur) : {k!r}  ({', '.join(keys[k][:3])})")
    print(f"Serveur : {len(keys)} clé(s) dans le code, {len(en)} traduction(s), {len(missing)} manquante(s), "
          f"{len(unused)} inutilisée(s)")
    return len(missing) + len(errors)


def main():
    if "--server-keys" in sys.argv:
        keys, errors = extract_server(SERVER_FILES)
        for e in errors:
            print(f"ERREUR {e}", file=sys.stderr)
        print(json.dumps(sorted(keys), ensure_ascii=False, indent=1))
        return 1 if errors else 0
    files = sorted(STATIC.glob("*.js"))
    keys, warnings = extract(files)
    if "--keys" in sys.argv:
        print(json.dumps(sorted(keys), ensure_ascii=False, indent=1))
        return 0
    try:
        en = json.loads(DICT.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ÉCHEC : {DICT.relative_to(ROOT)} introuvable (python3 tools/merge_locales.py)")
        return 1
    missing = sorted(k for k in keys if not isinstance(en.get(k), str))
    unused = sorted(k for k in en if k not in keys)
    # Variables {nom} : les mêmes des deux côtés (une variable oubliée s'afficherait telle quelle)
    var = re.compile(r"\{(\w+)\}")
    for k, v in en.items():
        if isinstance(v, str) and set(var.findall(k)) != set(var.findall(v)):
            warnings.append(f"en.json : variables différentes pour {k!r} → {v!r}")
    for w in warnings:
        print(f"  attention {w}")
    for k in unused:
        print(f"  inutilisée : {k!r}")
    for k in missing:
        print(f"  MANQUANTE : {k!r}  ({', '.join(keys[k][:3])})")
    print(f"Interface : {len(keys)} clé(s) dans le code, {len(en)} traduction(s), {len(missing)} manquante(s), "
          f"{len(unused)} inutilisée(s)")
    server_errors = check_server()
    if missing or server_errors:
        return 1
    print("Traductions OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
