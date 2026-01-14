#!/usr/bin/env python3
"""Automate Pi Day Challenge using Playwright with JavaScript canvas drawing."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as exc:
    raise SystemExit("Run: uv pip install -r requirements.txt") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default="https://yage.ai/genai/pi.html",
        help="URL (default: https://yage.ai/genai/pi.html)",
    )
    parser.add_argument(
        "--radius",
        type=float,
        default=140,
        help="Circle radius in pixels (default: 140)",
    )
    parser.add_argument(
        "--segments",
        type=int,
        default=360,
        help="Number of segments (default: 360)",
    )
    parser.add_argument(
        "--score-wait",
        type=float,
        default=2.0,
        help="Seconds to wait for score (default: 2.0)",
    )
    parser.add_argument(
        "--results-dir",
        type=Path,
        default=Path("results"),
        help="Results directory (default: results)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    timestamp = datetime.now().astimezone().isoformat()
    args.results_dir.mkdir(parents=True, exist_ok=True)

    print(f"Opening {args.url}...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(args.url)

        # Wait for page to load
        page.wait_for_selector("canvas")
        print("Canvas loaded")

        # Draw circle by dispatching mouse events
        print(f"Drawing circle with {args.segments} segments, radius {args.radius}px...")

        js_code = f"""
        async () => {{
            const canvas = document.querySelector('canvas');
            const rect = canvas.getBoundingClientRect();
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const radius = {args.radius};
            const segments = {args.segments};

            // Helper to dispatch mouse event
            function dispatchMouseEvent(type, x, y) {{
                const event = new MouseEvent(type, {{
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: rect.left + x,
                    clientY: rect.top + y
                }});
                canvas.dispatchEvent(event);
            }}

            // Calculate starting point
            const startX = centerX + radius;
            const startY = centerY;

            // Start drawing (mousedown)
            dispatchMouseEvent('mousedown', startX, startY);
            await new Promise(r => setTimeout(r, 10));

            // Draw circle (mousemove events)
            for (let i = 1; i <= segments; i++) {{
                const angle = (i / segments) * 2 * Math.PI;
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);
                dispatchMouseEvent('mousemove', x, y);

                // Small delay every 10 steps
                if (i % 10 === 0) {{
                    await new Promise(r => setTimeout(r, 1));
                }}
            }}

            // End drawing (mouseup)
            dispatchMouseEvent('mouseup', startX, startY);

            return {{
                centerX: centerX,
                centerY: centerY,
                radius: radius,
                segments: segments
            }};
        }}
        """

        result = page.evaluate(js_code)
        print(f"Circle drawn: center=({result['centerX']}, {result['centerY']}), radius={result['radius']}")

        # Click calculate button
        print("Clicking 'Calculate Pi' button...")
        page.click("button:has-text('Calculate Pi')")

        # Wait for result
        print(f"Waiting {args.score_wait}s for score...")
        time.sleep(args.score_wait)

        # Extract score
        result_div = page.query_selector("#result")
        score_data = {}

        if result_div:
            result_text = result_div.inner_text()
            print(f"\nScore result:\n{result_text}")

            lines = result_text.strip().split('\n')
            score_data["result_text"] = result_text

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
            },
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

        time.sleep(2)
        browser.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
