#!/usr/bin/env python3
"""Automate Pi Day Challenge using Playwright + PyAutoGUI."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Tuple

try:
    import pyautogui as pag
    from playwright.sync_api import sync_playwright
except ImportError as exc:
    raise SystemExit(
        "Required packages missing. Run: uv pip install -r requirements.txt"
    ) from exc

Point = Tuple[float, float]


def to_int_point(point: Point) -> Tuple[int, int]:
    return int(round(point[0])), int(round(point[1]))


def draw_circle_with_playwright(page, center: Point, radius: float, segments: int, start_angle: float):
    """Draw a circle using Playwright's mouse (viewport coordinates)."""
    start_x = center[0] + radius * math.cos(start_angle)
    start_y = center[1] + radius * math.sin(start_angle)

    print(f"Moving to start point: ({start_x:.1f}, {start_y:.1f})")

    # Click on canvas first to ensure it's focused
    page.mouse.click(center[0], center[1])
    time.sleep(0.1)

    # Move to start and press mouse down
    page.mouse.move(start_x, start_y)
    page.mouse.down()

    # Draw the circle with small delays
    step_delay = 0.001  # Small delay between moves
    for step in range(1, segments + 1):
        theta = start_angle + (2 * math.pi * step / segments)
        x = center[0] + radius * math.cos(theta)
        y = center[1] + radius * math.sin(theta)
        page.mouse.move(x, y)
        if step % 10 == 0:  # Add tiny pause every 10 steps
            time.sleep(step_delay)

    page.mouse.up()
    print("Circle drawing complete")


def get_tween(name: str):
    tween = getattr(pag, name, None)
    if tween is None:
        raise SystemExit(f"Tween '{name}' not found on pyautogui")
    return tween


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default="https://yage.ai/genai/pi.html",
        help="Pi Day Challenge URL (default: https://yage.ai/genai/pi.html)",
    )
    parser.add_argument(
        "--radius",
        type=float,
        default=200,
        help="Circle radius in pixels (default: 200)",
    )
    parser.add_argument(
        "--segments",
        type=int,
        default=300,
        help="Number of segments (default: 300)",
    )
    parser.add_argument(
        "--segment-duration",
        type=float,
        default=0.007,
        help="Seconds per segment (default: 0.007)",
    )
    parser.add_argument(
        "--move-duration",
        type=float,
        default=0.3,
        help="Seconds to move to start (default: 0.3)",
    )
    parser.add_argument(
        "--tween",
        default="easeInOutQuad",
        help="PyAutoGUI tween function (default: easeInOutQuad)",
    )
    parser.add_argument(
        "--start-angle",
        type=float,
        default=0.0,
        help="Starting angle in radians (default: 0)",
    )
    parser.add_argument(
        "--pre-delay",
        type=float,
        default=2.0,
        help="Seconds to wait before drawing (default: 2.0)",
    )
    parser.add_argument(
        "--score-wait",
        type=float,
        default=3.0,
        help="Seconds to wait for score (default: 3.0)",
    )
    parser.add_argument(
        "--results-dir",
        type=Path,
        default=Path("results"),
        help="Results directory (default: results)",
    )
    parser.add_argument(
        "--pause",
        type=float,
        default=0.005,
        help="PyAutoGUI pause (default: 0.005)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pag.FAILSAFE = True
    pag.PAUSE = args.pause
    tween = get_tween(args.tween)

    timestamp = datetime.now().astimezone().isoformat()
    args.results_dir.mkdir(parents=True, exist_ok=True)

    print(f"Opening {args.url} with Playwright...")

    with sync_playwright() as p:
        # Launch browser (headless=False so we can see it)
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(args.url)

        # Wait for canvas to load
        canvas = page.wait_for_selector("canvas")
        print("Canvas loaded")

        # Get canvas bounding box (viewport coordinates)
        bbox = canvas.bounding_box()
        if not bbox:
            raise RuntimeError("Could not get canvas bounding box")

        print(f"Canvas bounds (viewport): {bbox}")

        # Calculate center in viewport coordinates (for Playwright mouse)
        canvas_center = (
            bbox['x'] + bbox['width'] / 2,
            bbox['y'] + bbox['height'] / 2
        )

        print(f"Canvas center (viewport coords): {canvas_center}")
        print(f"Circle radius: {args.radius}px")
        print(f"\nWaiting {args.pre_delay}s before drawing...")
        time.sleep(args.pre_delay)

        # Draw the circle using Playwright's mouse
        draw_circle_with_playwright(
            page=page,
            center=canvas_center,
            radius=args.radius,
            segments=args.segments,
            start_angle=args.start_angle,
        )

        # Click calculate button
        print("\nClicking 'Calculate Pi' button...")
        calc_button = page.wait_for_selector("button:has-text('Calculate Pi')")
        calc_button.click()

        # Wait for result
        print(f"Waiting {args.score_wait}s for score...")
        time.sleep(args.score_wait)

        # Extract score from DOM
        result_div = page.query_selector("#result")
        if result_div:
            result_text = result_div.inner_text()
            print(f"\nScore result:\n{result_text}")

            # Parse the result
            lines = result_text.strip().split('\n')
            score_data = {"result_text": result_text}

            for line in lines:
                if "Your calculated Pi:" in line:
                    score_data["calculated_pi"] = line.split(":")[-1].strip()
                elif "Actual Pi:" in line:
                    score_data["actual_pi"] = line.split(":")[-1].strip()
                elif "Accuracy:" in line:
                    accuracy_str = line.split(":")[-1].strip().rstrip('%')
                    score_data["accuracy"] = float(accuracy_str)
        else:
            print("Warning: Could not find result div")
            score_data = {}

        # Take screenshot
        screenshot_path = args.results_dir / f"score_{timestamp.replace(':', '-')}.png"
        page.screenshot(path=str(screenshot_path))
        print(f"Screenshot saved to {screenshot_path}")

        # Save results
        results = {
            "timestamp": timestamp,
            "parameters": {
                "radius": args.radius,
                "segments": args.segments,
                "segment_duration": args.segment_duration,
                "tween": args.tween,
                "start_angle": args.start_angle,
            },
            "canvas_bounds": bbox,
            "screenshot": str(screenshot_path),
            **score_data,
        }

        results_file = args.results_dir / f"result_{timestamp.replace(':', '-')}.json"
        results_file.write_text(json.dumps(results, indent=2))
        print(f"Results saved to {results_file}")

        if "accuracy" in score_data:
            print(f"\n{'='*60}")
            print(f"ACCURACY: {score_data['accuracy']}%")
            print(f"{'='*60}")

        # Keep browser open for a moment
        time.sleep(2)
        browser.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
