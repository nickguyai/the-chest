#!/usr/bin/env python3
"""Scrape CVPR 2024 listing and export metadata to CSV."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterable, List
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://openaccess.thecvf.com"
LISTING_PATH = "/CVPR2024?day=all"
LISTING_URL = urljoin(BASE_URL, LISTING_PATH)


def fetch_listing_html() -> str:
    """Download the CVPR 2024 listing page."""

    response = requests.get(LISTING_URL, timeout=60)
    response.raise_for_status()
    return response.text


def extract_entries(html: str) -> List[dict]:
    """Parse listing HTML and return paper metadata entries."""

    soup = BeautifulSoup(html, "html.parser")
    entries: List[dict] = []

    for title_block in soup.select("dt.ptitle"):
        link_tag = title_block.find("a")
        if not link_tag:
            continue

        title = link_tag.get_text(strip=True)
        link = urljoin(BASE_URL, link_tag.get("href", ""))

        author_block = title_block.find_next_sibling("dd")
        author_names = (
            [a.get_text(strip=True) for a in author_block.find_all("a")]
            if author_block
            else []
        )

        resource_block = (
            author_block.find_next_sibling("dd") if author_block else None
        )
        if resource_block is None:
            resource_block = title_block.find_next_sibling("dd")

        pdf_link = ""
        if resource_block:
            for anchor in resource_block.find_all("a"):
                if anchor.get_text(strip=True).lower() == "pdf":
                    pdf_link = urljoin(BASE_URL, anchor.get("href", ""))
                    break

        entries.append(
            {
                "title": title,
                "link": link,
                "authors": "; ".join(author_names),
                "pdf_link": pdf_link,
            }
        )

    return entries


def write_csv(entries: Iterable[dict], output_path: Path) -> None:
    """Persist entries to CSV with the required columns."""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=["title", "link", "authors", "pdf_link"]
        )
        writer.writeheader()
        for entry in entries:
            writer.writerow(entry)


def main() -> None:
    html = fetch_listing_html()
    entries = extract_entries(html)
    output_path = Path(__file__).with_name("cvpr2024_papers.csv")
    write_csv(entries, output_path)
    print(f"Wrote {len(entries)} entries to {output_path}")


if __name__ == "__main__":
    main()
