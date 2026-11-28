#!/usr/bin/env python3
"""
Create the two synthetic 800x800 sketch fixtures used by the Phase 2 harness.

These are deterministic line-art fixtures, not real user drawings. Replace them
with real Draw Your Own exports before a final real-provider pilot.

Usage:
    python -I phase2/make_sketch_fixtures.py

Requires Pillow.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "fixtures" / "sketches"
SIZE = 800
SCALE = 2
INK = (28, 28, 32, 255)


def canvas():
    big = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
    return big, ImageDraw.Draw(big)


def line(draw, points, width=7):
    scaled = [(x * SCALE, y * SCALE) for x, y in points]
    draw.line(scaled, fill=INK, width=width * SCALE, joint="curve")


def arc(draw, box, start, end, width=7):
    x1, y1, x2, y2 = box
    draw.arc(
        (x1 * SCALE, y1 * SCALE, x2 * SCALE, y2 * SCALE),
        start=start,
        end=end,
        fill=INK,
        width=width * SCALE,
    )


def dress():
    big, draw = canvas()
    # Neckline and shoulders.
    arc(draw, (365, 160, 435, 215), 200, 340, 7)
    line(draw, [(365, 192), (340, 210), (327, 250)], 7)
    line(draw, [(435, 192), (460, 210), (473, 250)], 7)
    # Short puff sleeves.
    arc(draw, (300, 205, 355, 285), 100, 300, 7)
    arc(draw, (445, 205, 500, 285), 240, 440, 7)
    # Bodice sides and waist.
    line(draw, [(327, 250), (326, 310), (334, 360)], 7)
    line(draw, [(473, 250), (474, 310), (466, 360)], 7)
    line(draw, [(334, 360), (466, 360)], 7)
    # Waist bow.
    line(draw, [(388, 355), (400, 370), (412, 355)], 6)
    line(draw, [(400, 370), (386, 394)], 5)
    line(draw, [(400, 370), (414, 394)], 5)
    # Flared skirt.
    line(draw, [(334, 360), (300, 540), (280, 628)], 8)
    line(draw, [(466, 360), (500, 540), (520, 628)], 8)
    arc(draw, (280, 580, 520, 660), 15, 165, 8)
    # Center front seam; keep it light and open.
    line(draw, [(400, 372), (400, 612)], 4)
    # Pocket hints.
    line(draw, [(344, 425), (344, 468), (382, 468)], 4)
    line(draw, [(456, 425), (456, 468), (418, 468)], 4)
    return big.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def wide_leg_pants():
    big, draw = canvas()
    # Waistband and hips.
    line(draw, [(332, 388), (468, 388)], 8)
    line(draw, [(332, 388), (326, 430)], 7)
    line(draw, [(468, 388), (474, 430)], 7)
    # Crotch and inner legs.
    line(draw, [(326, 430), (350, 470), (390, 500)], 7)
    line(draw, [(474, 430), (450, 470), (410, 500)], 7)
    line(draw, [(390, 500), (378, 585), (368, 650)], 7)
    line(draw, [(410, 500), (422, 585), (432, 650)], 7)
    # Wide outer legs and hems.
    line(draw, [(326, 430), (305, 550), (294, 650)], 8)
    line(draw, [(474, 430), (495, 550), (506, 650)], 8)
    line(draw, [(294, 650), (368, 650)], 8)
    line(draw, [(432, 650), (506, 650)], 8)
    # Center creases and waistband detail.
    line(draw, [(330, 400), (368, 400)], 4)
    line(draw, [(432, 400), (470, 400)], 4)
    line(draw, [(343, 470), (330, 632)], 3)
    line(draw, [(457, 470), (470, 632)], 3)
    return big.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = [
        ("dress-lineart.png", dress()),
        ("wide-leg-pants-lineart.png", wide_leg_pants()),
    ]
    for name, image in outputs:
        path = OUT / name
        image.save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
