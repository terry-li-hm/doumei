#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["Pillow"]
# ///
"""Generate Doumei app icons — clock with route-colored bus markers + glass sheen."""

import math
from PIL import Image, ImageDraw, ImageFilter

BG = (15, 23, 42)        # --bg #0f172a
MUTED = (148, 163, 184)  # --muted #94a3b8
TEXT = (241, 245, 249)    # --text #f1f5f9
R77 = (125, 211, 252)    # --r77 #7dd3fc (sky blue)
R99 = (251, 191, 36)     # --r99 #fbbf24 (amber)
ACCENT = (56, 189, 248)  # center dot


def polar(cx, cy, r, deg):
    rad = math.radians(deg - 90)
    return cx + r * math.cos(rad), cy + r * math.sin(rad)


def draw_icon(size):
    # Render at 4x then downscale for anti-aliasing
    s = size * 4
    img = Image.new("RGBA", (s, s), (*BG, 255))
    draw = ImageDraw.Draw(img)

    cx = cy = s / 2
    pad = s * 0.12
    face_r = (s - 2 * pad) / 2

    # 4 cardinal tick marks (12, 3, 6, 9)
    for deg in (0, 90, 180, 270):
        x1, y1 = polar(cx, cy, face_r * 0.80, deg)
        x2, y2 = polar(cx, cy, face_r * 0.95, deg)
        draw.line([(x1, y1), (x2, y2)], fill=MUTED, width=round(s * 0.025))

    # Hour hand — pointing ~10 o'clock (300°)
    ohx, ohy = polar(cx, cy, face_r * 0.40, 300)
    draw.line([(cx, cy), (ohx, ohy)], fill=MUTED, width=round(s * 0.04))

    # Minute hand — pointing ~2 o'clock (72°)
    hx, hy = polar(cx, cy, face_r * 0.62, 72)
    draw.line([(cx, cy), (hx, hy)], fill=TEXT, width=round(s * 0.028))

    # Route 77 dot — solid sky blue at ~25min (150°)
    dot_r = face_r * 0.07
    dx, dy = polar(cx, cy, face_r * 0.88, 150)
    draw.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=R77)

    # Route 99 ring — hollow amber at ~37min (222°)
    ring_r = dot_r * 0.9
    ring_w = round(s * 0.012)
    d2x, d2y = polar(cx, cy, face_r * 0.88, 222)
    draw.ellipse(
        [d2x - ring_r, d2y - ring_r, d2x + ring_r, d2y + ring_r],
        fill=None, outline=R99, width=ring_w,
    )

    # Center dot
    cd_r = s * 0.025
    draw.ellipse([cx - cd_r, cy - cd_r, cx + cd_r, cy + cd_r], fill=ACCENT)

    # --- Glass sheen overlay ---
    # Subtle highlight arc on upper-left for iOS glossy feel
    sheen = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)

    # Large elliptical highlight, offset up-left
    hl_cx, hl_cy = cx - s * 0.12, cy - s * 0.18
    hl_rx, hl_ry = s * 0.38, s * 0.30
    sd.ellipse(
        [hl_cx - hl_rx, hl_cy - hl_ry, hl_cx + hl_rx, hl_cy + hl_ry],
        fill=(255, 255, 255, 22),
    )
    # Blur the highlight for soft glass effect
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=s * 0.06))
    img = Image.alpha_composite(img, sheen)

    # Downscale with high-quality resampling, convert to RGB
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
