#!/usr/bin/env python3
"""Utility for capturing the Pi Day canvas geometry for PyAutoGUI automation.

The script records three screen positions (canvas center, a point on the rim,
and the "calculate pi" button) and stores them in a JSON file for reuse by the
circle-drawing automation script.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Tuple

try:
    import pyautogui as pag
except ImportError as exc:  # pragma: no cover - dependency check
    raise SystemExit(
        "PyAutoGUI is required. Install it with 'pip install pyautogui pillow'."
    ) from exc

Point = Tuple[int, int]


def capture_point(label: str, delay: float) -> Point:
    """Prompt the user to position the cursor and record the coordinates."""
    print(f"\nHover over the {label}… recording in {delay:.1f}s")
    time.sleep(delay)
    point = pag.position()
    print(f"Captured {label}: {point}")
    return point.x, point.y


def distance(a: Point, b: Point) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--delay",
        type=float,
        default=3.0,
        help="Seconds to wait before capturing each point (default: 3.0)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("calibration_data.json"),
        help="Path to write the calibration JSON (default: calibration_data.json)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pag.FAILSAFE = True  # flick to a corner to abort safely

    print("Starting calibration. Ensure the Pi Day canvas is visible.")
    center = capture_point("canvas center", args.delay)
    rim = capture_point("a point on the circle rim", args.delay)
    calc_btn = capture_point("'calculate pi' button", args.delay)

    print("\nNow we'll capture the score display region...")
    print("Please click 'calculate pi' to show the score, then:")
    score_corner1 = capture_point("one corner of score display", args.delay)
    score_corner2 = capture_point("opposite corner of score display", args.delay)

    # Ensure proper bounding box (handle any corner order)
    left = min(score_corner1[0], score_corner2[0])
    top = min(score_corner1[1], score_corner2[1])
    right = max(score_corner1[0], score_corner2[0])
    bottom = max(score_corner1[1], score_corner2[1])

    radius = distance(center, rim)
    payload = {
        "timestamp": datetime.now().astimezone().isoformat(),
        "center": {"x": center[0], "y": center[1]},
        "radius": radius,
        "calculate_button": {"x": calc_btn[0], "y": calc_btn[1]},
        "score_region": {
            "left": left,
            "top": top,
            "width": right - left,
            "height": bottom - top,
        },
    }

    args.output.write_text(json.dumps(payload, indent=2))
    print("\nSaved calibration to", args.output.resolve())
    print(f"Center: {center}, radius: {radius:.2f}, calculate button: {calc_btn}")
    print(f"Score region: {score_top_left} to {score_bottom_right}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
