#!/usr/bin/env python3
"""
Analyze real-pilot PNG artifacts and add automated transparency metrics.

This script does not generate images or call any provider. It is intended for a
report.json produced by phase2/pilot-runner.cjs in real mode. Qualitative style,
sketch fidelity, and fitting suitability remain human-review fields.

Usage:
    python -I phase2/analyze_outputs.py --report phase2/output/<run>/report.json
    python -I phase2/analyze_outputs.py --image clothes/gomlek1.png

The report command writes report.automated.json next to the input report.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def safe_relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(path.resolve()).replace("\\", "/")


def analyze_image(path: Path) -> dict:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        width, height = rgba.size
        alpha = rgba.getchannel("A")
        histogram = alpha.histogram()
        total = width * height
        transparent = histogram[0]
        semi = sum(histogram[1:255])
        opaque = histogram[255]
        bbox = alpha.getbbox()
        corners = [
            alpha.getpixel((0, 0)),
            alpha.getpixel((width - 1, 0)),
            alpha.getpixel((0, height - 1)),
            alpha.getpixel((width - 1, height - 1)),
        ]
        return {
            "path": safe_relative(path),
            "width": width,
            "height": height,
            "mode": image.mode,
            "hasAlpha": "A" in image.getbands() or "transparency" in image.info,
            "alphaBBox": list(bbox) if bbox else None,
            "transparentPixels": transparent,
            "semiTransparentPixels": semi,
            "opaquePixels": opaque,
            "transparentRatioPct": round(transparent * 100.0 / total, 4) if total else None,
            "semiTransparentRatioPct": round(semi * 100.0 / total, 4) if total else None,
            "opaqueRatioPct": round(opaque * 100.0 / total, 4) if total else None,
            "transparentCorners": all(value == 0 for value in corners),
            "edgeNotes": (
                "Semi-transparent pixels are a proxy only; inspect the actual "
                "silhouette for halos, fringe, holes, and cutout artifacts."
            ),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--report", type=Path)
    group.add_argument("--image", type=Path)
    args = parser.parse_args()

    if args.image:
        path = args.image
        if not path.is_absolute():
            path = ROOT / path
        if not path.exists():
            print(f"Image not found: {path}", file=sys.stderr)
            return 1
        print(json.dumps(analyze_image(path), indent=2, ensure_ascii=False))
        return 0

    report_path = args.report
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    if not report_path.exists():
        print(f"Report not found: {report_path}", file=sys.stderr)
        return 1

    report = json.loads(report_path.read_text(encoding="utf-8"))
    analyzed = 0
    skipped = 0
    for case in report.get("cases", []):
        artifacts = case.get("artifacts") or []
        if not artifacts:
            case["automatedChecks"] = {
                "status": "no_artifacts",
                "reason": "No generated artifact for this case; nothing to analyze.",
            }
            skipped += 1
            continue
        measurements = []
        for artifact in artifacts:
            image_path = ROOT / artifact["path"]
            if not image_path.exists():
                measurements.append(
                    {
                        "path": artifact.get("path"),
                        "status": "missing",
                    }
                )
                skipped += 1
                continue
            measurements.append({"status": "analyzed", **analyze_image(image_path)})
            analyzed += 1
        case["automatedChecks"] = {
            "status": "analyzed",
            "images": measurements,
            "edgeCleanliness": "manual_review_required",
        }

    output = report_path.with_name("report.automated.json")
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"analyzed {analyzed} artifact(s), skipped {skipped}; wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
