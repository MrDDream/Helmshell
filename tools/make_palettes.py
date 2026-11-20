#!/usr/bin/env python3
"""Palettes de couleurs de Helmshell (en plus de Sarcelle, Ambre et Bleu, écrites à la main dans app.css).

Chaque couleur source donne des jetons --m-* en clair et en sombre, sur le modèle des rôles
Material 3 : tons (L* CIELAB) fixes par rôle, teinte de la couleur source, chroma réduite si elle
sort de l'espace sRGB. Écrit static/palettes.css et affiche la ligne SEEDS à reporter dans app.js.

    python3 tools/make_palettes.py
"""
import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "palettes.css"

# id, nom, teinte (degrés LCh), chroma de la couleur principale, décalage de teinte du tertiaire
SEEDS = [
    ("violet", "Violet", 305, 52, 50),
    ("indigo", "Indigo", 285, 50, -60),
    ("rose", "Rose", 350, 50, 40),
    ("corail", "Corail", 35, 50, 60),
    ("citron", "Citron", 105, 46, 60),
    ("foret", "Forêt", 140, 38, 60),
    ("ardoise", "Ardoise", 250, 10, 40),
]

# Rôle → (palette, ton clair, ton sombre). Palettes : p (principale), s (secondaire), t (tertiaire),
# n (neutre), v (neutre teintée)
ROLES = {
    "primary": ("p", 40, 80), "on-primary": ("p", 100, 20),
    "primary-container": ("p", 90, 30), "on-primary-container": ("p", 10, 90),
    "secondary-container": ("s", 90, 30), "on-secondary-container": ("s", 10, 90),
    "tertiary-container": ("t", 90, 30), "on-tertiary-container": ("t", 10, 90),
    "surface": ("n", 98, 6), "s-low": ("n", 96, 10), "s-cont": ("n", 94, 12),
    "s-high": ("n", 92, 17), "s-highest": ("n", 90, 22),
    "on-surface": ("n", 10, 90), "on-surface-variant": ("v", 30, 80),
    "outline": ("v", 50, 60), "outline-variant": ("v", 80, 30),
    "inverse-surface": ("n", 20, 90), "inverse-on-surface": ("n", 95, 20), "inverse-primary": ("p", 80, 40),
}
# Couleurs d'état communes (identiques à Sarcelle)
FIXED = {
    "light": {"error": "#BA1A1A", "on-error": "#FFFFFF", "error-container": "#FFDAD6", "on-error-container": "#410002",
              "ok": "#1B873F", "ok-container": "#C2F0CC", "on-ok-container": "#002110",
              "warn": "#8A5A00", "warn-container": "#FFDDB0", "on-warn-container": "#2B1700"},
    "dark": {"error": "#FFB4AB", "on-error": "#690005", "error-container": "#93000A", "on-error-container": "#FFDAD6",
             "ok": "#6DD58C", "ok-container": "#1F4D2E", "on-ok-container": "#B6F2C4",
             "warn": "#F2BD5C", "warn-container": "#5C4100", "on-warn-container": "#FFDDB0"},
}


def lab_to_srgb(L, a, b):
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    inv = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    X, Y, Z = 0.95047 * inv(fx), 1.0 * inv(fy), 1.08883 * inv(fz)
    r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
    g = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z
    bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
    gam = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return tuple(gam(c) for c in (r, g, bl))


def lch_hex(L, C, H):
    """Couleur LCh → #RRGGBB, chroma réduite jusqu'à entrer dans sRGB."""
    c = C
    while True:
        rgb = lab_to_srgb(L, c * math.cos(math.radians(H)), c * math.sin(math.radians(H)))
        if all(-0.0005 <= x <= 1.0005 for x in rgb) or c <= 0:
            break
        c -= 0.5
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in rgb)


def palettes(hue, chroma, t_shift):
    return {"p": (hue, chroma), "s": (hue, min(16, chroma / 3)), "t": ((hue + t_shift) % 360, max(24, chroma / 2)),
            "n": (hue, min(4, chroma / 6)), "v": (hue, min(8, chroma / 4))}


def block(seed, theme, hue, chroma, t_shift):
    pal = palettes(hue, chroma, t_shift)
    lines = [f':root[data-seed="{seed}"][data-theme="{theme}"] {{']
    for role, (p, tl, td) in ROLES.items():
        h, c = pal[p]
        tone = tl if theme == "light" else td
        cc = c if p != "p" or tone not in (100, 10) else min(c, 12)
        lines.append(f"  --m-{role}: {lch_hex(tone, cc, h)};")
    for role, v in FIXED[theme].items():
        lines.append(f"  --m-{role}: {v};")
    lines.append(f"  color-scheme: {theme};")
    lines.append("}")
    return "\n".join(lines)


def main():
    parts = ["/* Généré par tools/make_palettes.py : ne pas modifier à la main. */"]
    swatches = []
    for seed, name, hue, chroma, t_shift in SEEDS:
        parts.append(block(seed, "light", hue, chroma, t_shift))
        parts.append(block(seed, "dark", hue, chroma, t_shift))
        pal = palettes(hue, chroma, t_shift)
        swatches.append([seed, name, [lch_hex(40, chroma, hue), lch_hex(90, chroma, hue), lch_hex(90, pal["t"][1], pal["t"][0])]])
    OUT.write_text("\n".join(parts) + "\n")
    print("ok", OUT)
    print(json.dumps(swatches, ensure_ascii=False))


if __name__ == "__main__":
    main()
