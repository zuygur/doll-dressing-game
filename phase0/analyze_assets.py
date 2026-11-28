#!/usr/bin/env python3
"""
Phase 0 asset/geometry inspection and calibration helper.

This script is development-only. It does not modify the game or any original
assets. It:
  1. verifies character and worn Upper/Lower canvas dimensions,
  2. validates fit-profile geometry against the 320x700 canvas,
  3. checks that the available test-set assets exist and match their recorded
     alpha bounding boxes,
  4. renders calibration overlays for both dolls.

Usage (from anywhere):
    python -I phase0/analyze_assets.py

Requires Pillow:  pip install Pillow
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:  # pragma: no cover
    print("Pillow is required: pip install Pillow", file=sys.stderr)
    raise SystemExit(1) from exc

ROOT = Path(__file__).resolve().parent.parent
PHASE0 = Path(__file__).resolve().parent
CANVAS = (320, 700)
SCALE = 2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BOX_COLORS = {
    "upper.standard": (33, 120, 220, 255),
    "upper.outerwear": (230, 130, 20, 255),
    "lower.pants": (30, 160, 80, 255),
    "lower.skirt": (150, 80, 200, 255),
    "fullbody.dress": (210, 40, 140, 255),
}


def load_json(name: str):
    return json.loads((PHASE0 / name).read_text(encoding="utf-8"))


def alpha_info(path: Path):
    with Image.open(path) as im:
        rgba = im.convert("RGBA")
        bbox = rgba.getchannel("A").getbbox()
        return im.size, im.mode, bbox


def point_inside(pt, w=320, h=700):
    x, y = pt
    return 0 <= x <= w and 0 <= y <= h


def box_inside(box, w=320, h=700):
    x1, y1, x2, y2 = box
    return 0 <= x1 < x2 <= w and 0 <= y1 < y2 <= h


def box_contains(outer, inner):
    ox1, oy1, ox2, oy2 = outer
    ix1, iy1, ix2, iy2 = inner
    return ox1 <= ix1 and oy1 <= iy1 and ix2 <= ox2 and iy2 <= oy2


def get_font(size=14):
    candidates = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_label(draw, xy, text, font, color=(20, 20, 20, 255)):
    x, y = xy
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = 2 * SCALE
    draw.rectangle(
        [x - pad, y - pad, x + tw + pad, y + th + pad * 2],
        fill=(255, 255, 255, 210),
    )
    draw.text((x, y), text, font=font, fill=color)


def render_overlay(gender: str, profile: dict):
    asset = ROOT / profile["referenceAsset"]
    with Image.open(asset) as im:
        base = im.convert("RGBA").resize(
            (CANVAS[0] * SCALE, CANVAS[1] * SCALE), Image.Resampling.LANCZOS
        )

    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = get_font(13 * SCALE // 2)
    small = get_font(11 * SCALE // 2)

    # Grid every 20 source px; stronger every 100.
    for x in range(0, CANVAS[0] + 1, 20):
        sx = x * SCALE
        color = (0, 0, 0, 55) if x % 100 else (0, 0, 0, 110)
        draw.line([(sx, 0), (sx, CANVAS[1] * SCALE)], fill=color, width=1)
        if x % 100 == 0:
            draw_label(draw, (sx + 2, 2), str(x), small)
    for y in range(0, CANVAS[1] + 1, 20):
        sy = y * SCALE
        color = (0, 0, 0, 55) if y % 100 else (0, 0, 0, 110)
        draw.line([(0, sy), (CANVAS[0] * SCALE, sy)], fill=color, width=1)
        if y % 100 == 0:
            draw_label(draw, (2, sy + 1), str(y), small)

    # Target boxes (selected representative subtypes).
    for key, color in BOX_COLORS.items():
        slot, subtype = key.split(".", 1)
        node = profile["slots"].get(slot, {}).get("subtypes", {}).get(subtype)
        if not node:
            continue
        x1, y1, x2, y2 = node["targetBox"]
        draw.rectangle(
            [x1 * SCALE, y1 * SCALE, x2 * SCALE, y2 * SCALE],
            outline=color,
            width=2 * SCALE,
        )
        label = key.replace(".", " / ")
        draw_label(draw, (x1 * SCALE + 2 * SCALE, y1 * SCALE + 2 * SCALE), label, small, color)

    # Landmarks.
    for name, (x, y) in profile["landmarks"].items():
        px, py = x * SCALE, y * SCALE
        r = 3 * SCALE
        draw.ellipse([px - r, py - r, px + r, py + r], fill=(220, 20, 60, 255), outline=(255, 255, 255, 255))
        draw_label(draw, (px + 4 * SCALE, py - 5 * SCALE), name, small, (160, 0, 30, 255))

    out = Image.alpha_composite(base, overlay)
    out_path = PHASE0 / f"calibration-overlay-{gender}.png"
    out.save(out_path)
    return out_path


def validate_profile(profile: dict, errors: list[str]):
    gender = profile.get("gender")
    if profile.get("canvas") != {"width": 320, "height": 700}:
        errors.append(f"{gender}: canvas is not 320x700")
    for name, pt in profile.get("landmarks", {}).items():
        if not point_inside(pt):
            errors.append(f"{gender}: landmark {name} outside canvas: {pt}")
    for slot_name, slot in profile.get("slots", {}).items():
        subtypes = slot.get("subtypes", {})
        if not subtypes:
            errors.append(f"{gender}: slot {slot_name} has no subtypes")
        for subtype_name, node in subtypes.items():
            if not box_inside(node["targetBox"]):
                errors.append(f"{gender}/{slot_name}/{subtype_name}: targetBox outside canvas")
            if not box_inside(node["safeBox"]):
                errors.append(f"{gender}/{slot_name}/{subtype_name}: safeBox outside canvas")
            if not box_contains(node["safeBox"], node["targetBox"]):
                errors.append(f"{gender}/{slot_name}/{subtype_name}: targetBox not inside safeBox")
            for anchor, pt in node.get("targetAnchors", {}).items():
                if not point_inside(pt):
                    errors.append(f"{gender}/{slot_name}/{subtype_name}: anchor {anchor} outside canvas: {pt}")
            if slot_name in ("upper", "lower") and node.get("coversLower"):
                errors.append(f"{gender}/{slot_name}/{subtype_name}: coversLower must be false")
            if slot_name == "fullbody" and not node.get("coversLower"):
                errors.append(f"{gender}/fullbody/{subtype_name}: coversLower must be true")
            if subtype_name == "outerwear" and node.get("coversLower"):
                errors.append(f"{gender}/upper/outerwear: coats/jackets must not cover lower")


def main():
    errors: list[str] = []
    print("=== Phase 0 asset inspection ===")
    for name in ("doll.png", "boydoll.png"):
        size, mode, bbox = alpha_info(ROOT / name)
        print(f"{name}: size={size} mode={mode} alpha_bbox={bbox}")
        if size != CANVAS:
            errors.append(f"{name}: expected {CANVAS}, got {size}")

    print("\n=== Worn Upper/Lower clothing assets ===")
    clothing = []
    for path in sorted((ROOT / "clothes").glob("*.png")):
        if "-removebg-preview" in path.name:
            continue
        size, mode, bbox = alpha_info(path)
        clothing.append((path.name, size, mode, bbox))
        if size != CANVAS:
            errors.append(f"{path.name}: worn clothing asset is not {CANVAS}: {size}")
        if mode != "RGBA":
            errors.append(f"{path.name}: worn clothing asset is not RGBA: {mode}")
    for name, size, mode, bbox in clothing:
        print(f"{name}: size={size} mode={mode} alpha_bbox={bbox}")

    print("\n=== Fit profiles ===")
    profiles = {
        "girl": load_json("fit-profiles.girl.json"),
        "boy": load_json("fit-profiles.boy.json"),
    }
    for gender, profile in profiles.items():
        validate_profile(profile, errors)
        print(f"{gender}: status={profile['status']} version={profile['profileVersion']} slots={list(profile['slots'])}")

    print("\n=== Test set ===")
    test_set = load_json("test-set.json")
    for case in test_set["cases"]:
        profile = profiles[case["targets"][0]]
        slot = profile["slots"].get(case["profileSlot"], {})
        if case["subtype"] not in slot.get("subtypes", {}):
            errors.append(f"{case['id']}: subtype {case['profileSlot']}/{case['subtype']} missing from profile")
        if case["status"] == "available":
            path = ROOT / case["sourceAsset"]
            if not path.exists():
                errors.append(f"{case['id']}: missing asset {case['sourceAsset']}")
                continue
            size, mode, bbox = alpha_info(path)
            if size != CANVAS:
                errors.append(f"{case['id']}: asset is not {CANVAS}: {size}")
            if mode != "RGBA":
                errors.append(f"{case['id']}: asset is not RGBA: {mode}")
            if bbox != tuple(case["sourceBBox"]):
                errors.append(f"{case['id']}: measured bbox {bbox} != recorded {tuple(case['sourceBBox'])}")
            target_box = tuple(slot["subtypes"][case["subtype"]]["targetBox"])
            if bbox and not box_contains(target_box, bbox):
                errors.append(f"{case['id']}: source bbox {bbox} is not inside targetBox {target_box}")
            print(f"{case['id']}: {case['sourceAsset']} size={size} bbox={bbox}")
        else:
            print(f"{case['id']}: future-generated ({case['profileSlot']}/{case['subtype']})")
    print(f"cases: {len(test_set['cases'])}")

    print("\n=== Calibration overlays ===")
    for gender, profile in profiles.items():
        out = render_overlay(gender, profile)
        print(f"wrote {out.relative_to(ROOT)}")

    if errors:
        print("\n=== VALIDATION ERRORS ===")
        for err in errors:
            print(" -", err)
        raise SystemExit(1)
    print("\nAll Phase 0 checks passed.")


if __name__ == "__main__":
    main()
