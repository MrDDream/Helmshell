#!/usr/bin/env python3
"""Logo de Helmshell (un gouvernail) : SVG et icônes PNG.

Dessin dans un carré de 120 unités : huit rayons et leurs poignées, la jante (bleu marine) et le
moyeu orange. Deux versions : détaillée (logo, icônes d'appli) et grasse (favicon, lisible en 16 px).
Les PNG sont rendus sans dépendance (champs de distance + lissage) :

    python3 tools/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "static"

TILE = "#E3EEF8"
NAVY = "#1F4E79"
ORANGE = "#D97757"
TILE_R = 28
C = (60, 60)
TIPS = ((60, 16), (60, 104), (16, 60), (104, 60), (29, 29), (91, 91), (91, 29), (29, 91))
SPOKES = ((TIPS[0], TIPS[1]), (TIPS[2], TIPS[3]), (TIPS[4], TIPS[5]), (TIPS[6], TIPS[7]))
# version : (largeur des rayons, rayon de la jante, épaisseur de la jante, poignées, rayon du moyeu)
FULL = (6, 27, 8, 6, 9)
BOLD = (9, 27, 11, 0, 11)


def svg(v=FULL, tile=True):
    sw, rr, rw, knob, hub = v
    bg = f'<rect width="120" height="120" rx="{TILE_R}" fill="{TILE}"/>' if tile else ""
    spokes = "".join(f"M{a[0]} {a[1]}L{b[0]} {b[1]}" for a, b in SPOKES)
    knobs = "".join(f'<circle cx="{x}" cy="{y}" r="{knob}"/>' for x, y in TIPS) if knob else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">{bg}'
            f'<g stroke="{NAVY}" stroke-linecap="round"><path d="{spokes}" stroke-width="{sw}"/>'
            f'<circle cx="60" cy="60" r="{rr}" fill="none" stroke-width="{rw}"/></g>'
            + (f'<g fill="{NAVY}">{knobs}</g>' if knobs else "")
            + f'<circle cx="60" cy="60" r="{hub}" fill="{ORANGE}"/></svg>\n')


# --- Rendu PNG -----------------------------------------------------------------------

def _rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def _seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def _round_rect(px, py, x, y, w, h, r):
    cx, cy, hx, hy = x + w / 2, y + h / 2, w / 2 - r, h / 2 - r
    qx, qy = abs(px - cx) - hx, abs(py - cy) - hy
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def _shapes(px, py, v):
    """[(distance signée, couleur)] dans l'ordre de dessin (unités du logo)."""
    sw, rr, rw, knob, hub = v
    d = math.hypot(px - C[0], py - C[1])
    navy = min(min(_seg(px, py, *a, *b) for a, b in SPOKES) - sw / 2, abs(d - rr) - rw / 2)
    if knob:
        navy = min(navy, min(math.hypot(px - x, py - y) for x, y in TIPS) - knob)
    return [(navy, NAVY), (d - hub, ORANGE)]


def render(size, mode, v=FULL):
    """mode : 'tile' (carré arrondi, coins transparents), 'full' (fond plein, pour iOS),
    'mask' (fond plein, dessin réduit dans la zone sûre des icônes masquables)."""
    glyph = {"tile": 1.0, "full": 0.88, "mask": 0.72}[mode]
    s = size / 120
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            u, w = (i + 0.5) / s, (j + 0.5) / s
            a = max(0.0, min(1.0, 0.5 - _round_rect(u, w, 0, 0, 120, 120, TILE_R) * s)) if mode == "tile" else 1.0
            col = list(_rgb(TILE))
            if a > 0:
                gu, gv = 60 + (u - 60) / glyph, 60 + (w - 60) / glyph  # dessin centré, mis à l'échelle
                for dist, c in _shapes(gu, gv, v):
                    k = max(0.0, min(1.0, 0.5 - dist * s * glyph))
                    if k:
                        cc = _rgb(c)
                        col = [round(col[n] * (1 - k) + cc[n] * k) for n in range(3)]
            row += bytes(col) + bytes([round(255 * a)])
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(t, data):
        return struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    (STATIC / "logo.svg").write_text(svg(FULL))
    (STATIC / "favicon.svg").write_text(svg(BOLD))
    for name, size, mode in (("icone-192.png", 192, "tile"), ("icone-512.png", 512, "tile"),
                             ("icone-masquable-512.png", 512, "mask"), ("apple-touch-icon.png", 180, "full"),
                             ("icone-32.png", 32, "tile")):
        (STATIC / name).write_bytes(render(size, mode, BOLD if size <= 48 else FULL))
        print("ok", name)
