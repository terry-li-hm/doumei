#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["Pillow"]
# ///
"""Generate Doumei app icons — bold, clean, iOS-native.

Per Apple HIG (iOS 26): don't bake glass/specular/shadows — the OS
adds Liquid Glass dynamically. Keep artwork high-contrast and bold.
"""

import math
from PIL import Image, ImageDraw

BG_TOP = (18, 28, 48)       # subtle gradient top
BG_BOT = (8, 15, 32)        # subtle gradient bottom
FACE = (255, 255, 255, 12)  # barely-there clock face circle
MUTED = (160, 175, 195)     # brighter ticks for boldness
TEXT = (245, 248, 252)       # near-white hands
R77 = (125, 211, 252)       # sky blue
R99 = (251, 191, 36)        # amber
ACCENT = (80, 200, 248)     # center dot


def polar(cx, cy, r, deg):
    rad = math.radians(deg - 90)
    return cx + r * math.cos(rad), cy + r * math.sin(rad)


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def draw_icon(size):
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    # Subtle vertical gradient
    for y in range(s):
        c = lerp(BG_TOP, BG_BOT, y / s)
        draw.line([(0, y), (s, y)], fill=(*c, 255))

    cx = cy = s / 2
    pad = s * 0.12
    face_r = (s - 2 * pad) / 2

    # Subtle clock face circle (gives structure without being heavy)
    draw.ellipse(
        [cx - face_r, cy - face_r, cx + face_r, cy + face_r],
        fill=None, outline=(255, 255, 255, 18), width=round(s * 0.006),
    )

    # 4 cardinal ticks — bolder
    for deg in (0, 90, 180, 270):
        x1, y1 = polar(cx, cy, face_r * 0.78, deg)
        x2, y2 = polar(cx, cy, face_r * 0.94, deg)
        draw.line([(x1, y1), (x2, y2)], fill=MUTED, width=round(s * 0.028))

    # Hour hand ~10 o'clock (300°) — bolder
    ohx, ohy = polar(cx, cy, face_r * 0.42, 300)
    draw.line([(cx, cy), (ohx, ohy)], fill=MUTED, width=round(s * 0.045))

    # Minute hand ~2 o'clock (72°) — bolder
    hx, hy = polar(cx, cy, face_r * 0.64, 72)
    draw.line([(cx, cy), (hx, hy)], fill=TEXT, width=round(s * 0.032))

    # Route 77 — solid sky blue at 150°
    dot_r = face_r * 0.075
    dx, dy = polar(cx, cy, face_r * 0.86, 150)
    draw.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=R77)

    # Route 99 — hollow amber ring at 222°
    ring_r = dot_r * 0.9
    ring_w = round(s * 0.014)
    d2x, d2y = polar(cx, cy, face_r * 0.86, 222)
    draw.ellipse(
        [d2x - ring_r, d2y - ring_r, d2x + ring_r, d2y + ring_r],
        fill=None, outline=R99, width=ring_w,
    )

    # Center dot
    cd_r = s * 0.028
    draw.ellipse([cx - cd_r, cy - cd_r, cx + cd_r, cy + cd_r], fill=ACCENT)

    img = img.resize((size, size), Image.LANCZOS)
    return img.convert("RGB")


if __name__ == "__main__":
    import pathlib

    out = pathlib.Path(__file__).resolve().parent.parent / "public"
    for sz in (192, 512, 1024):
        icon = draw_icon(sz)
        path = out / f"icon-{sz}.png"
        icon.save(path, "PNG")
        print(f"Wrote {path} ({sz}x{sz})")
