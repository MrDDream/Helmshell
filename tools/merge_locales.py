#!/usr/bin/env python3
"""Assemble les dictionnaires anglais à partir de leurs fragments en.*.json (en.part1.json…) :
static/locales/en.json (interface) et helmshell/locales/en.json (serveur).

Les clés sont triées ; une même clé traduite différemment dans deux fragments est une erreur.
Un dossier sans fragment garde son en.json tel quel.

    python3 tools/merge_locales.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIRS = [ROOT / "static" / "locales", ROOT / "helmshell" / "locales"]


def merge(locales):
    out = locales / "en.json"
    parts = sorted(p for p in locales.glob("en.*.json") if p != out)
    if not parts:
        return None
    merged, origin, conflicts = {}, {}, []
    for p in parts:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"ÉCHEC : {p.name} n'est pas du JSON valide ({e})")
            return 1
        if not isinstance(data, dict):
            print(f"ÉCHEC : {p.name} doit contenir un objet {{clé française: texte anglais}}")
            return 1
        for k, v in data.items():
            if not isinstance(v, str):
                conflicts.append(f"{p.name} : valeur non textuelle pour {k!r}")
            elif k in merged and merged[k] != v:
                conflicts.append(f"{k!r} : {merged[k]!r} ({origin[k]}) ≠ {v!r} ({p.name})")
            else:
                merged.setdefault(k, v)
                origin.setdefault(k, p.name)
    if conflicts:
        print(f"ÉCHEC : traductions en conflit dans {locales.relative_to(ROOT)}")
        for c in conflicts:
            print(f"  {c}")
        return 1
    out.write_text(json.dumps(dict(sorted(merged.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{out.relative_to(ROOT)} : {len(merged)} clé(s) depuis {', '.join(p.name for p in parts)}")
    return 0


def main():
    results = [merge(d) for d in DIRS if d.is_dir()]
    if all(r is None for r in results):
        print("Aucun fragment en.*.json dans " + ", ".join(str(d.relative_to(ROOT)) for d in DIRS))
        return 1
    return 1 if any(r for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
