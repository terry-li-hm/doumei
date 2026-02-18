#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["Pillow"]
# ///
"""Generate Doumei app icons — minimal clock with bus dot."""

import math
from PIL import Image, ImageDraw

BG = (15, 23, 42)        # --bg #0f172a
BG_LIGHT = (30, 41, 59)  # --surface #1e293b
ACCENT = (56, 189, 248)  # --accent #38bdf8
TEXT = (241, 245, 249)    # --text #f1f5f9
MUTED = (148, 163, 184)  # --muted #94a3b8


def polar(cx, cy, r, deg):
    rad = math.radians(deg - 90)
    return cx + r * math.cos(rad), cy + r * math.sin(rad)


def draw_icon(size):
    # Render at 4x then downscale for anti-aliasing
    s = size * 4
    img = Image.new("RGB", (s, s), BG)
    draw = ImageDraw.Draw(img)

    cx = cy = s / 2
    pad = s * 0.12
    face_r = (s - 2 * pad) / 2

    # 4 cardinal tick marks (12, 3, 6, 9)
    for deg in (0, 90, 180, 270):
        x1, y1 = polar(cx, cy, face_r * 0.80, deg)
        x2, y2 = polar(cx, cy, face_r * 0.95, deg)
        draw.line([(x1, y1), (x2, y2)], fill=MUTED, width=round(s * 0.025))

    # Hour hand — pointing ~10 o'clock (300°) for separation from minute hand
    ohx, ohy = polar(cx, cy, face_r * 0.40, 300)
    draw.line([(cx, cy), (ohx, ohy)], fill=MUTED, width=round(s * 0.04))

    # Minute hand — pointing ~2 o'clock (72°), bright white
    hx, hy = polar(cx, cy, face_r * 0.62, 72)
    draw.line([(cx, cy), (hx, hy)], fill=TEXT, width=round(s * 0.028))

    # Bus dot — prominent, at ~25min position (150°)
    dot_r = face_r * 0.07
    dx, dy = polar(cx, cy, face_r * 0.88, 150)
    draw.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=ACCENT)

    # Second bus dot — slightly smaller, at ~37min (222°)
    dot2_r = dot_r * 0.75
    d2x, d2y = polar(cx, cy, face_r * 0.88, 222)
    draw.ellipse([d2x - dot2_r, d2y - dot2_r, d2x + dot2_r, d2y + dot2_r], fill=ACCENT)

    # Center dot
    cd_r = s * 0.025
    draw.ellipse([cx - cd_r, cy - cd_r, cx + cd_r, cy + cd_r], fill=ACCENT)

    # Downscale with high-quality resampling
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    import pathlib

    out = pathlib.Path(__file__).resolve().parent.parent / "public"
    for s in (192, 512):
        img = draw_icon(s)
        path = out / f"icon-{s}.png"
        img.save(path, "PNG")
        print(f"Wrote {path} ({s}x{s})")

    # Also generate 1024 for App Store / og:image if needed
    img = draw_icon(1024)
    path = out / "icon-1024.png"
    img.save(path, "PNG")
    print(f"Wrote {path} (1024x1024)")
