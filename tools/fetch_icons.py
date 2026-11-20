#!/usr/bin/env python3
"""Jeux d'icônes des styles d'apparence → static/icons.js (à relancer seulement pour changer d'icônes).

Chaque nom d'icône de Helmshell (ICONS dans app.js) est cherché dans cinq familles open source,
téléchargées depuis npm via cdn.jsdelivr.net, puis rangées dans le dépôt :

  material  Material Symbols Rounded (Google, Apache 2.0)   style Material 3
  lucide    Lucide (ISC)                                     style Épuré
  phosphor  Phosphor Duotone (MIT)                           style Verre
  fluent    Fluent UI System Icons (Microsoft, MIT)          style Doux
  tabler    Tabler Icons (MIT)                               style Contrasté

    python3 tools/fetch_icons.py
"""
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "icons.js"
CDN = "https://cdn.jsdelivr.net/npm/"
# Versions épinglées (relevées le 19/11/2026) : un nouveau téléchargement donne les mêmes icônes
PKG = {"material": "@material-symbols/svg-400@0.49.0", "lucide": "lucide-static@1.76.0",
       "phosphor": "@phosphor-icons/core@2.1.1", "fluent": "@fluentui/svg-icons@1.1.347", "tabler": "@tabler/icons@3.52.0"}
# Seuls ces éléments et attributs SVG sont acceptés (icons.js est inséré tel quel dans la page)
SAFE_TAGS = {"path", "circle", "rect", "ellipse", "line", "polyline", "polygon", "g"}
SAFE_ATTRS = {"d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points",
              "opacity", "fill-rule", "clip-rule", "transform", "fill", "stroke"}

# nom Helmshell : (material, lucide, phosphor, fluent, tabler) ; « a|b » = essayer a puis b
MAP = {
    "logo": ("terminal", "terminal", "terminal", "window_console@20", "terminal"),
    "grid": ("grid_view", "layout-grid", "squares-four", "grid", "layout-grid"),
    "folder": ("folder", "folder", "folder", "folder", "folder"),
    "folderOpen": ("folder_open", "folder-open", "folder-open", "folder_open", "folder-open"),
    "folderPlus": ("create_new_folder", "folder-plus", "folder-plus", "folder_add", "folder-plus"),
    "file": ("description", "file-text", "file-text", "document", "file-text"),
    "filePlus": ("note_add", "file-plus", "file-plus", "document_add", "file-plus"),
    "broom": ("cleaning_services", "brush-cleaning|paintbrush", "broom", "broom", "brush|brush-off"),
    "spark": ("auto_awesome", "sparkles", "sparkle", "sparkle", "sparkles"),
    "upload": ("upload", "upload", "upload-simple", "arrow_upload", "upload"),
    "download": ("download", "download", "download-simple", "arrow_download", "download"),
    "globe": ("language", "globe", "globe", "globe", "world"),
    "sliders": ("tune", "sliders-horizontal", "sliders-horizontal", "options", "adjustments-horizontal"),
    "server": ("dns", "server", "hard-drives", "server", "server"),
    "search": ("search", "search", "magnifying-glass", "search", "search"),
    "plus": ("add", "plus", "plus", "add", "plus"),
    "external": ("open_in_new", "external-link|square-arrow-out-up-right", "arrow-square-out", "open", "external-link"),
    "stop": ("stop", "square", "stop", "stop", "player-stop"),
    "play": ("play_arrow", "play", "play", "play", "player-play"),
    "branch": ("fork_right|call_split|account_tree", "git-branch", "git-branch", "branch", "git-branch"),
    "chevron": ("chevron_right", "chevron-right", "caret-right", "chevron_right", "chevron-right"),
    "chevronDown": ("expand_more", "chevron-down", "caret-down", "chevron_down", "chevron-down"),
    "chevronUp": ("expand_less", "chevron-up", "caret-up", "chevron_up", "chevron-up"),
    "copy": ("content_copy", "copy", "copy", "copy", "copy"),
    "refresh": ("refresh", "refresh-cw", "arrows-clockwise", "arrow_sync", "refresh"),
    "trash": ("delete", "trash-2", "trash", "delete", "trash"),
    "edit": ("edit", "pencil", "pencil-simple", "edit", "pencil"),
    "term": ("terminal", "square-terminal", "terminal-window", "window_console@20", "terminal-2"),
    "logout": ("logout", "log-out", "sign-out", "sign_out", "logout"),
    "check": ("check", "check", "check", "checkmark", "check"),
    "x": ("close", "x", "x", "dismiss", "x"),
    "dotsV": ("more_vert", "ellipsis-vertical", "dots-three-vertical", "more_vertical", "dots-vertical"),
    "dots": ("more_horiz", "ellipsis", "dots-three", "more_horizontal", "dots"),
    "list": ("list", "list", "list", "text_bullet_list_ltr|text_bullet_list", "list"),
    "home": ("home", "house", "house", "home", "home"),
    "code": ("code", "code", "code", "code", "code"),
    "db": ("database", "database", "database", "database", "database"),
    "shield": ("shield", "shield", "shield", "shield", "shield"),
    "palette": ("palette", "palette", "palette", "color", "palette"),
    "bell": ("notifications", "bell", "bell", "alert", "bell"),
    "eye": ("visibility", "eye", "eye", "eye", "eye"),
    "task": ("task_alt", "list-checks", "list-checks", "task_list_ltr|task_list_square_ltr", "list-check"),
    "undo": ("undo", "undo-2", "arrow-counter-clockwise", "arrow_undo", "arrow-back-up"),
    "clock": ("schedule", "clock", "clock", "clock", "clock"),
    "keyboard": ("keyboard", "keyboard", "keyboard", "keyboard", "keyboard"),
    "image": ("image", "image", "image", "image", "photo"),
    "phone": ("smartphone", "smartphone", "device-mobile", "phone", "device-mobile"),
    "lock": ("lock", "lock", "lock", "lock_closed", "lock"),
    "send": ("send", "send", "paper-plane-right", "send", "send"),
    "qr": ("qr_code", "qr-code", "qr-code", "qr_code", "qrcode"),
}
FAMS = ("material", "lucide", "phosphor", "fluent", "tabler")
# Version pleine (élément actif de la navigation) pour les familles qui en ont une
FILLED = {"home", "folder", "spark", "term", "upload", "server", "sliders"}


def url(fam, name, filled=False):
    p = PKG[fam]
    if fam == "material":
        return f"{CDN}{p}/rounded/{name}{'-fill' if filled else ''}.svg"
    if fam == "lucide":
        return f"{CDN}{p}/icons/{name}.svg"
    if fam == "phosphor":
        return f"{CDN}{p}/assets/duotone/{name}-duotone.svg"
    if fam == "fluent":  # « nom@20 » : icône qui n'existe qu'en 20 px
        name, _, size = name.partition("@")
        return f"{CDN}{p}/icons/{name}_{size or 24}_{'filled' if filled else 'regular'}.svg"
    return f"{CDN}{p}/icons/outline/{name}.svg"


def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "helmshell-icons"}), timeout=30) as r:
            return r.read().decode()
    except Exception:  # noqa: BLE001
        return None


def clean(fam, svg):
    vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
    body = re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", svg.strip(), flags=re.S)
    body = re.sub(r"<!--.*?-->|<title>.*?</title>", "", body, flags=re.S)
    body = re.sub(r'<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*/>', "", body)   # cadre Tabler
    body = re.sub(r'<rect width="256" height="256" fill="none"\s*/>', "", body)          # cadre Phosphor
    body = re.sub(r'\s(class|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="(?!none)[^"]*"', "", body)
    body = re.sub(r"\s+", " ", body).strip()
    for tag in re.findall(r"<\s*/?\s*([A-Za-z][\w:-]*)", body):
        if tag.lower() not in SAFE_TAGS:
            raise ValueError(f"élément SVG refusé : {tag}")
    for attr in re.findall(r"\s([A-Za-z][\w:-]*)\s*=", body):
        if attr.lower() not in SAFE_ATTRS:
            raise ValueError(f"attribut SVG refusé : {attr}")
    return vb, body


def fetch(fam, key, names, filled=False):
    for n in names.split("|"):
        svg = get(url(fam, n, filled))
        if svg and "<svg" in svg:
            return fam, key, filled, n, clean(fam, svg)
    return fam, key, filled, names, None


def main():
    jobs = [(f, k, MAP[k][i]) for i, f in enumerate(FAMS) for k in MAP]
    jobs += [(f, k, MAP[k][FAMS.index(f)], True) for f in ("material", "fluent") for k in FILLED]
    sets, missing = {f: {} for f in FAMS}, []
    with ThreadPoolExecutor(16) as ex:
        for fam, key, filled, name, res in ex.map(lambda j: fetch(*j), jobs):
            if not res:
                missing.append(f"{fam}:{key} ({name}{' plein' if filled else ''})")
                continue
            vb, body = res
            entry = sets[fam].setdefault(key, {})
            if filled:
                entry["f"] = body
            else:
                entry.update({"v": vb, "d": body})
    for fam in FAMS:  # une version pleine sans la normale n'a pas de sens
        sets[fam] = {k: v for k, v in sets[fam].items() if "d" in v}
    head = ("// Généré par tools/fetch_icons.py : ne pas modifier à la main.\n"
            "// Material Symbols (Apache 2.0, Google) · Lucide (ISC) · Phosphor (MIT) · Fluent UI System Icons (MIT, Microsoft) · Tabler Icons (MIT)\n")
    OUT.write_text(head + "export const ICONSETS = " + json.dumps(sets, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("ok", OUT, f"{OUT.stat().st_size // 1024} Ko", {f: len(v) for f, v in sets.items()})
    if missing:
        print("manquantes :", ", ".join(sorted(missing)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
