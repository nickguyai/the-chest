#!/usr/bin/env python3
"""Automate drawing a smooth circle in the Pi Day Challenge canvas using PyAutoGUI."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Tuple

try:
    import pyautogui as pag
    import pytesseract
except ImportError as exc:  # pragma: no cover - dependency check
    raise SystemExit(
        "Required packages missing. Install with 'pip install pyautogui pillow pytesseract'."
    ) from exc

Point = Tuple[float, float]


def load_calibration(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(
            f"Calibration file '{path}' not found. Run calibrate_pi_canvas.py first."
        )
    with path.open() as fh:
        return json.load(fh)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--calibration",
        type=Path,
        default=Path("calibration_data.json"),
        help="Path to the calibration JSON produced by calibrate_pi_canvas.py",
    )
    parser.add_argument("--center-x", type=float, help="Override center X coordinate")
    parser.add_argument("--center-y", type=float, help="Override center Y coordinate")
    parser.add_argument("--radius", type=float, help="Override circle radius in pixels")
    parser.add_argument("--calc-x", type=float, help="Override 'calculate pi' button X")
    parser.add_argument("--calc-y", type=float, help="Override 'calculate pi' button Y")
    parser.add_argument(
        "--segments",
        type=int,
        default=240,
        help="Number of segments used to approximate the circle (default: 240)",
    )
    parser.add_argument(
        "--segment-duration",
        type=float,
        default=0.01,
        help="Seconds per drag segment (default: 0.01)",
    )
    parser.add_argument(
        "--move-duration",
        type=float,
        default=0.3,
        help="Seconds to move to the starting point (default: 0.3)",
    )
    parser.add_argument(
        "--pre-delay",
        type=float,
        default=3.0,
        help="Seconds to wait before starting (default: 3.0)",
    )
    parser.add_argument(
        "--pause",
        type=float,
        default=0.005,
        help="Global PyAutoGUI pause between actions (default: 0.005)",
    )
    parser.add_argument(
        "--tween",
        default="easeInOutSine",
        help="Name of the PyAutoGUI tween function to smooth movement",
    )
    parser.add_argument(
        "--start-angle",
        type=float,
        default=0.0,
        help="Starting angle in radians (default: 0 → east point)",
    )
    parser.add_argument(
        "--skip-calc-click",
        action="store_true",
        help="Do not click the 'calculate pi' button after drawing",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print computed coordinates without moving the mouse",
    )
    parser.add_argument(
        "--results-dir",
        type=Path,
        default=Path("results"),
        help="Directory to store screenshots and results (default: results)",
    )
    parser.add_argument(
        "--score-wait",
        type=float,
        default=3.0,
        help="Seconds to wait for score to appear after clicking calculate (default: 3.0)",
    )
    return parser.parse_args()


def resolve_point(args: argparse.Namespace, calibration: dict, key: str) -> Point:
    if key == "center":
        x = args.center_x if args.center_x is not None else calibration["center"]["x"]
        y = args.center_y if args.center_y is not None else calibration["center"]["y"]
    elif key == "calculate_button":
        x = args.calc_x if args.calc_x is not None else calibration["calculate_button"]["x"]
        y = args.calc_y if args.calc_y is not None else calibration["calculate_button"]["y"]
    else:
        raise ValueError(f"Unsupported point key: {key}")
    return float(x), float(y)


def resolve_radius(args: argparse.Namespace, calibration: dict) -> float:
    if args.radius is not None:
        return float(args.radius)
    return float(calibration["radius"])


def get_tween(name: str):
    tween = getattr(pag, name, None)
    if tween is None:
        raise SystemExit(f"Tween '{name}' not found on pyautogui")
    return tween


def to_int_point(point: Point) -> Tuple[int, int]:
    return int(round(point[0])), int(round(point[1]))


def draw_circle(
    center: Point,
    radius: float,
    segments: int,
    segment_duration: float,
    move_duration: float,
    tween,
    start_angle: float,
    dry_run: bool,
):
    start_x = center[0] + radius * math.cos(start_angle)
    start_y = center[1] + radius * math.sin(start_angle)
    start_point = to_int_point((start_x, start_y))

    if dry_run:
        print("[dry-run] Would move to", start_point)
        return

    pag.moveTo(*start_point, duration=move_duration, tween=tween)
    pag.mouseDown()
    for step in range(1, segments + 1):
        theta = start_angle + (2 * math.pi * step / segments)
        x = center[0] + radius * math.cos(theta)
        y = center[1] + radius * math.sin(theta)
        pag.dragTo(*to_int_point((x, y)), duration=segment_duration, tween=tween, button="left")
    pag.mouseUp()


def click_calculate(button_point: Point, dry_run: bool):
    target = to_int_point(button_point)
    if dry_run:
        print("[dry-run] Would click", target)
        return
    time.sleep(0.2)
    pag.click(*target)


def extract_score_from_image(screenshot) -> dict:
    """Extract Pi values and accuracy from screenshot using OCR."""
    try:
        text = pytesseract.image_to_string(screenshot)
        print(f"OCR extracted text:\n{text}\n")

        result = {}

        # Extract calculated Pi value
        calc_pi_match = re.search(r'Your calculated Pi[:\s]+([0-9.]+)', text, re.IGNORECASE)
        if calc_pi_match:
            result['calculated_pi'] = calc_pi_match.group(1)

        # Extract actual Pi value
        actual_pi_match = re.search(r'Actual Pi[:\s]+([0-9.]+)', text, re.IGNORECASE)
        if actual_pi_match:
            result['actual_pi'] = actual_pi_match.group(1)

        # Extract accuracy percentage
        accuracy_match = re.search(r'Accuracy[:\s]+([0-9.]+)%?', text, re.IGNORECASE)
        if accuracy_match:
            result['accuracy'] = float(accuracy_match.group(1))

        return result
    except Exception as e:
        print(f"Warning: OCR extraction failed: {e}")
        return {}


def capture_score(results_dir: Path, wait_time: float, score_region: dict | None, dry_run: bool) -> dict:
    """Wait for score to appear and capture screenshot."""
    if dry_run:
        print(f"[dry-run] Would wait {wait_time}s and capture score screenshot")
        return {}

    print(f"Waiting {wait_time}s for score to appear...")
    time.sleep(wait_time)

    timestamp = datetime.now().astimezone().isoformat()
    results_dir.mkdir(parents=True, exist_ok=True)

    # Take screenshot - use specific region if available
    screenshot_path = results_dir / f"score_{timestamp.replace(':', '-')}.png"

    if (score_region and
        all(k in score_region for k in ['left', 'top', 'width', 'height']) and
        score_region['width'] > 0 and score_region['height'] > 0):
        # Capture specific region
        region = (
            score_region['left'],
            score_region['top'],
            score_region['width'],
            score_region['height']
        )
        screenshot = pag.screenshot(region=region)
        print(f"Captured score region: {region}")
    else:
        # Fallback to full screen
        screenshot = pag.screenshot()
        if score_region:
            print(f"Invalid score region (width={score_region.get('width')}, height={score_region.get('height')}), using full screen")
        else:
            print("Captured full screen (no score region defined)")

    screenshot.save(screenshot_path)
    print(f"Screenshot saved to {screenshot_path}")

    # Extract score data using OCR
    score_data = extract_score_from_image(screenshot)

    return {
        "timestamp": timestamp,
        "screenshot": str(screenshot_path),
        **score_data,
    }


def main() -> int:
    args = parse_args()
    calibration = load_calibration(args.calibration)

    center = resolve_point(args, calibration, "center")
    calc_btn = resolve_point(args, calibration, "calculate_button")
    radius = resolve_radius(args, calibration)
    tween = get_tween(args.tween)

    pag.FAILSAFE = True
    pag.PAUSE = args.pause

    print("Loaded calibration from", args.calibration)
    print(f"Center={center}, radius={radius:.2f}, calculate_button={calc_btn}")
    print("\n" + "="*60)
    print("IMPORTANT: Ensure the browser with Pi Day Challenge is:")
    print("  1. VISIBLE on screen (not minimized)")
    print("  2. FOCUSED (click on it to make it active)")
    print("  3. Canvas is ready for drawing")
    print("="*60)
    print(f"\nDrawing in {args.pre_delay:.1f}s… move focus to the Pi Day canvas NOW")
    time.sleep(args.pre_delay)

    draw_circle(
        center=center,
        radius=radius,
        segments=args.segments,
        segment_duration=args.segment_duration,
        move_duration=args.move_duration,
        tween=tween,
        start_angle=args.start_angle,
        dry_run=args.dry_run,
    )

    results = {
        "parameters": {
            "center": list(center),
            "radius": radius,
            "segments": args.segments,
            "segment_duration": args.segment_duration,
            "tween": args.tween,
            "start_angle": args.start_angle,
        }
    }

    if not args.skip_calc_click:
        click_calculate(calc_btn, args.dry_run)
        score_region = calibration.get('score_region')
        score_data = capture_score(args.results_dir, args.score_wait, score_region, args.dry_run)
        results.update(score_data)

        # Save results JSON
        if not args.dry_run and score_data:
            results_file = args.results_dir / f"result_{score_data['timestamp'].replace(':', '-')}.json"
            results_file.write_text(json.dumps(results, indent=2))
            print(f"Results saved to {results_file}")
    else:
        print("Skipped calculate click")

    return 0


if __name__ == "__main__":
    sys.exit(main())
