# Pi Day Challenge Automation

Automates drawing a perfect circle in the Pi Day Challenge (https://yage.ai/genai/pi.html) to achieve high accuracy scores.

## Setup

### 1. Create virtual environment with uv

```bash
uv venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

### 2. Install dependencies

```bash
uv pip install -r requirements.txt
playwright install chromium
```

## Usage

### Quick Start (Recommended)

```bash
source .venv/bin/activate
python scripts/draw_circle_js.py --segments 360 --radius 140
```

This will:
1. Open browser with the Pi Day Challenge
2. Draw a perfect circle using 360 segments
3. Click "Calculate Pi"
4. Extract the score from the page
5. Save screenshot and results to `results/` directory

### Options

```bash
python scripts/draw_circle_js.py \
  --radius 140 \
  --segments 360 \
  --score-wait 2 \
  --results-dir results
```

## Results

Results are stored in the `results/` directory:
- **Screenshot**: `score_<timestamp>.png` - Full page screenshot showing the drawn circle and score
- **JSON**: `result_<timestamp>.json` - Contains:
  - Parameters used (radius, segments)
  - Calculated Pi value
  - Actual Pi value
  - Accuracy percentage
  - Timestamp

Example result:
```json
{
  "timestamp": "2025-11-06T23:22:35.082690-05:00",
  "parameters": {
    "radius": 140.0,
    "segments": 360
  },
  "screenshot": "results/score_2025-11-06T23-22-35.082690-05-00.png",
  "result_text": "Calculated Pi: 3.183977\nActual Pi: 3.141593\nAccuracy: 98.65%",
  "calculated_pi": "3.183977",
  "actual_pi": "3.141593",
  "accuracy": 98.65
}
```

## How It Works

1. **Playwright** launches Chromium browser (headless=False)
2. Opens the Pi Day Challenge URL
3. Locates the canvas element
4. **Dispatches mouse events** (mousedown, mousemove, mouseup) to simulate drawing
5. Clicks "Calculate Pi" button
6. **Extracts score from DOM** (no OCR needed!)
7. Saves screenshot and results

## Tips for Higher Accuracy

- **More segments** = smoother circle (try 480, 720)
- **Optimal radius** = ~140px (40% of canvas size)
- **Perfect closure** = ensure circle returns to start point

## Architecture

- `scripts/draw_circle_js.py` - Main automation script (Playwright + JavaScript)
- `scripts/calibrate_pi_canvas.py` - Legacy calibration tool (not needed)
- `scripts/draw_circle.py` - Legacy PyAutoGUI version (deprecated)
- `requirements.txt` - Python dependencies

## Why This Approach Works

The Pi Day Challenge tracks drawing via mouse event listeners, not canvas rendering. We:
1. Dispatch proper `MouseEvent` objects to the canvas
2. This triggers the page's event handlers that populate the `points` array
3. The page validates `points.length >= 3` before calculating
4. Our dispatched events look identical to real user input

Previous attempts failed because they either:
- Drew on canvas context (no events triggered)
- Used wrong coordinate systems
- Didn't account for event listener requirements
