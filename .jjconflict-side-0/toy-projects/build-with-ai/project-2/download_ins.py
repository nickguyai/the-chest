"""Download every image from an Instagram profile via network interception.

Example:
    python download_ins.py https://www.instagram.com/grapeot/

The script launches a headless Chromium browser using Playwright, navigates to
the target profile, and keeps scrolling until the profile finishes loading.
While the page is loading it intercepts the same network requests that Instagram
emits (`/api/v1/users/web_profile_info/` plus paginated GraphQL calls) and
extracts every image URL (including carousel children). Once collection is
complete the script downloads the images with `requests`.

Requirements:
    pip install playwright requests
    playwright install chromium
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib.parse import urlparse

import requests

try:
    from playwright.sync_api import Response, sync_playwright
except ImportError as exc:  # pragma: no cover - invoked only when dependency missing
    raise SystemExit(
        "Playwright is required. Install it with `pip install playwright` and "
        "run `playwright install chromium`."
    ) from exc


class MediaCollector:
    """Collects media URLs emitted by Instagram network responses."""

    def __init__(self) -> None:
        self.media_urls: Dict[str, str] = {}
        self._ordered_ids: List[str] = []
        self.post_ids: set[str] = set()
        self.total_posts: int | None = None
        self._dirty = False

    def ingest_payload(self, payload: Dict) -> None:
        user = payload.get("data", {}).get("user")
        if not user:
            return

        media = user.get("edge_owner_to_timeline_media") or {}
        if self.total_posts is None:
            self.total_posts = media.get("count")

        edges = media.get("edges") or []
        before = len(self.media_urls)
        for edge in edges:
            node = edge.get("node") or {}
            node_id = node.get("id")
            if node_id:
                self.post_ids.add(node_id)
            self._capture_node(node)

        if len(self.media_urls) > before:
            self._dirty = True

    def _capture_node(self, node: Dict) -> None:
        display_url = node.get("display_url")
        node_id = node.get("id")
        if display_url and node_id and node_id not in self.media_urls:
            self.media_urls[node_id] = display_url
            self._ordered_ids.append(node_id)

        sidecar = node.get("edge_sidecar_to_children") or {}
        for child in sidecar.get("edges", []):
            child_node = child.get("node") or {}
            child_id = child_node.get("id")
            child_url = child_node.get("display_url")
            if child_id and child_url and child_id not in self.media_urls:
                self.media_urls[child_id] = child_url
                self._ordered_ids.append(child_id)

    def consume_dirty_flag(self) -> bool:
        dirty = self._dirty
        self._dirty = False
        return dirty

    def iter_media(self) -> Iterable[Tuple[str, str]]:
        for media_id in self._ordered_ids:
            yield media_id, self.media_urls[media_id]

    def media_items(self) -> List[Tuple[str, str]]:
        return list(self.iter_media())


def extract_username(profile_url: str) -> str:
    parsed = urlparse(profile_url)
    if not parsed.netloc:
        raise ValueError("Invalid profile URL")
    username = parsed.path.strip("/")
    if not username:
        raise ValueError("Could not determine username from URL")
    return username


def auto_scroll(page, collector: MediaCollector, pause_ms: int = 1500) -> None:
    idle_loops = 0
    while True:
        page.mouse.wheel(0, 4000)
        page.wait_for_timeout(pause_ms)

        if collector.total_posts and len(collector.post_ids) >= collector.total_posts:
            break

        if collector.consume_dirty_flag():
            idle_loops = 0
            continue

        idle_loops += 1
        if idle_loops >= 6:
            break


def wait_for_initial_payload(collector: MediaCollector, timeout_ms: int = 10000) -> None:
    deadline = time.time() + timeout_ms / 1000
    while collector.total_posts is None and time.time() < deadline:
        time.sleep(0.2)


def harvest_media(profile_url: str, headless: bool = False) -> Tuple[str, List[Tuple[str, str]]]:
    username = extract_username(profile_url)
    collector = MediaCollector()

    print(f"Launching browser (headless={headless})...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context()

        def handle_response(response: Response) -> None:
            url = response.url
            if "web_profile_info" not in url and "graphql/query" not in url:
                return
            print(f"Intercepted: {url}")
            try:
                data = response.json()
            except Exception as e:
                print(f"Failed to parse JSON: {e}")
                return
            if "data" in data:
                print(f"Ingesting payload...")
                collector.ingest_payload(data)

        context.on("response", handle_response)
        page = context.new_page()
        print(f"Navigating to {profile_url}...")
        page.goto(profile_url, wait_until="networkidle")
        print(f"Waiting for initial payload...")
        wait_for_initial_payload(collector)
        print(f"Starting auto-scroll... (total_posts={collector.total_posts})")
        auto_scroll(page, collector)
        print(f"Collected {len(collector.media_urls)} media URLs")
        browser.close()

    return username, collector.media_items()


def download_images(media: Iterable[Tuple[str, str]], target_dir: Path) -> int:
    target_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }
    )

    downloaded = 0
    for media_id, url in media:
        suffix = Path(urlparse(url).path).suffix or ".jpg"
        destination = target_dir / f"{media_id}{suffix}"
        if destination.exists():
            continue

        with session.get(url, stream=True, timeout=60) as resp:
            resp.raise_for_status()
            with open(destination, "wb") as handle:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        handle.write(chunk)
        print(f"Saved {destination}")
        downloaded += 1

    return downloaded


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile_url", help="Full Instagram profile URL")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("downloads"),
        help="Directory where images will be stored (default: ./downloads)",
    )
    parser.add_argument(
        "--headful",
        action="store_true",
        help="Run Chromium with UI (useful for debugging)",
    )
    parser.add_argument(
        "--max-media",
        type=int,
        default=None,
        help="Optional cap on number of images to download (for testing)",
    )
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    username, media_items = harvest_media(args.profile_url, headless=not args.headful)
    if not media_items:
        print("No media URLs captured. The account may be private or blocked.")
        return 1

    items = media_items
    if args.max_media is not None:
        items = items[: args.max_media]

    target_dir = args.output / username
    downloaded = download_images(items, target_dir)
    print(f"Downloaded {downloaded} images to {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
