#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["Pillow"]
# ///
"""Generate Doumei app icons — clock with route-colored markers, iOS-style depth."""

import math
from PIL import Image, ImageDraw, ImageFilter

# Base palette
BG_TOP = (22, 33, 55)       # lighter navy for gradient top
BG_BOT = (10, 18, 35)       # darker navy for gradient bottom
MUTED = (148, 163, 184)
TEXT = (241, 245, 249)
R77 = (125, 211, 252)       # sky blue
R99 = (251, 191, 36)        # amber
ACCENT = (56, 189, 248)


def polar(cx, cy, r, deg):
    rad = math.radians(deg - 90)
    return cx + r * math.cos(rad), cy + r * math.sin(rad)


def lerp_color(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def draw_icon(size):
    s = size * 4  # 4x supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    # --- Vertical gradient background ---
    for y in range(s):
        t = y / s
        c = lerp_color(BG_TOP, BG_BOT, t)
        draw.line([(0, y), (s, y)], fill=(*c, 255))

    cx = cy = s / 2
    pad = s * 0.12
    face_r = (s - 2 * pad) / 2

    # --- Subtle radial vignette (darken edges) ---
    vignette = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    for i in range(40):
        t = i / 40
        r = s * 0.7 * (1 - t * 0.4)
        alpha = int(t * 30)
        vd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0, alpha))
    img = Image.alpha_composite(img, vignette)
    draw = ImageDraw.Draw(img)

    # --- 4 cardinal tick marks ---
    for deg in (0, 90, 180, 270):
        x1, y1 = polar(cx, cy, face_r * 0.80, deg)
        x2, y2 = polar(cx, cy, face_r * 0.95, deg)
        draw.line([(x1, y1), (x2, y2)], fill=MUTED, width=round(s * 0.025))

    # --- Hour hand ~10 o'clock (300°) ---
    ohx, ohy = polar(cx, cy, face_r * 0.40, 300)
    draw.line([(cx, cy), (ohx, ohy)], fill=MUTED, width=round(s * 0.04))

    # --- Minute hand ~2 o'clock (72°) ---
    hx, hy = polar(cx, cy, face_r * 0.62, 72)
    draw.line([(cx, cy), (hx, hy)], fill=TEXT, width=round(s * 0.028))

    # --- Route 77 dot — solid sky blue at 150° ---
    dot_r = face_r * 0.07
    dx, dy = polar(cx, cy, face_r * 0.88, 150)
    draw.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=R77)

    # --- Route 99 ring — hollow amber at 222° ---
    ring_r = dot_r * 0.9
    ring_w = round(s * 0.012)
    d2x, d2y = polar(cx, cy, face_r * 0.88, 222)
    draw.ellipse(
        [d2x - ring_r, d2y - ring_r, d2x + ring_r, d2y + ring_r],
        fill=None, outline=R99, width=ring_w,
    )

    # --- Center dot ---
    cd_r = s * 0.025
    draw.ellipse([cx - cd_r, cy - cd_r, cx + cd_r, cy + cd_r], fill=ACCENT)

    # --- iOS-style glass highlight ---
    # Curved highlight band across upper third
    sheen = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    # Main highlight — wide ellipse, upper portion
    hl_cy = cy - s * 0.28
    hl_rx, hl_ry = s * 0.52, s * 0.22
    sd.ellipse(
        [cx - hl_rx, hl_cy - hl_ry, cx + hl_rx, hl_cy + hl_ry],
        fill=(255, 255, 255, 35),
    )
    # Smaller bright spot at top-center for specular
    sp_cy = cy - s * 0.36
    sp_rx, sp_ry = s * 0.28, s * 0.10
    sd.ellipse(
        [cx - sp_rx, sp_cy - sp_ry, cx + sp_rx, sp_cy + sp_ry],
        fill=(255, 255, 255, 25),
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=s * 0.05))
    img = Image.alpha_composite(img, sheen)

    # Downscale + convert to RGB
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
