#!/usr/bin/env python3
"""Build static reverse split JSON for the Revsplit dashboard."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

HEADERS = {
    "User-Agent": "Revsplit public dashboard contact@example.com",
    "Accept": "text/html,application/json",
}

CONFIDENCE_RANK = {"Low": 1, "Medium": 2, "High": 3}


def _number(value: str) -> int | float:
    parsed = float(value)
    if parsed.is_integer():
        return int(parsed)
    return parsed


def _format_number(value: int | float) -> str:
    if isinstance(value, float) and not value.is_integer():
        return f"{value:g}"
    return str(int(value))


def parse_ratio(text: str | None) -> tuple[str, int | float, int | float] | None:
    """Parse a reverse ratio and reject forward splits."""
    if not text:
        return None

    normalized = text.strip().lower().replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", "-")
    patterns = [
        r"(\d+(?:\.\d+)?)\s*[-\s]*for\s*[-\s]*(\d+(?:\.\d+)?)",
        r"(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)",
        r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)",
    ]

    for pattern in patterns:
        match = re.search(pattern, normalized)
        if not match:
            continue

        ratio_from = _number(match.group(1))
        ratio_to = _number(match.group(2))
        if ratio_to <= ratio_from:
            return None

        return f"{_format_number(ratio_from)}-for-{_format_number(ratio_to)}", ratio_from, ratio_to

    return None


def normalize_date(text: str | None) -> str | None:
    if not text:
        return None

    value = text.strip()
    if not value or value.lower() in {"unknown", "n/a", "na", "none"}:
        return None

    value = re.sub(r"\s+", " ", value.replace(",", ", ")).replace(",  ", ", ")
    formats = ["%Y-%m-%d", "%m/%d/%Y", "%b %d, %Y", "%B %d, %Y", "%Y%m%d"]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass

    match = re.search(r"([A-Z][a-z]+\s+\d{1,2},\s+\d{4})", value)
    if match:
        return normalize_date(match.group(1))

    return None


def parse_bool(value: str | bool | None) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None

    normalized = str(value).strip().lower()
    if normalized in {"true", "yes", "1", "y"}:
        return True
    if normalized in {"false", "no", "0", "n", ""}:
        return False
    return None


def check_rounding_up_flag(text: str) -> bool:
    rounding_patterns = [
        r"rounded\s+up",
        r"round\s+up",
        r"rounding\s+up",
        r"rounded\s+upward",
        r"rounds\s+up",
    ]
    context_patterns = [
        r"fractional\s+shares?",
        r"fractional\s+share",
        r"reverse\s+split",
        r"stock\s+split",
        r"share\s+consolidation",
    ]

    for rounding_pattern in rounding_patterns:
        match = re.search(rounding_pattern, text, re.IGNORECASE)
        if not match:
            continue
        start = max(match.start() - 320, 0)
        end = min(match.end() + 320, len(text))
        window = text[start:end]
        if any(re.search(pattern, window, re.IGNORECASE) for pattern in context_patterns):
            return True

    return False


def make_id(symbol: str, split_date: str) -> str:
    digest = hashlib.sha1(f"{symbol.upper()}:{split_date}".encode("utf-8")).hexdigest()[:10]
    return f"{symbol.upper()}-{split_date}-{digest}"


def build_event(
    *,
    symbol: str,
    company_name: str,
    split_date: str,
    ratio: str,
    source: str,
    confidence: str | None = None,
    rounding_up: bool | None = None,
    filing_url: str | None = None,
    summary: str | None = None,
    last_updated: str,
) -> dict | None:
    parsed_ratio = parse_ratio(ratio)
    if not parsed_ratio:
        return None

    display_ratio, ratio_from, ratio_to = parsed_ratio
    normalized_date = normalize_date(split_date)
    if not normalized_date:
        return None

    clean_symbol = symbol.strip().upper()
    if not clean_symbol:
        return None

    event = {
        "id": make_id(clean_symbol, normalized_date),
        "symbol": clean_symbol,
        "companyName": company_name.strip() or clean_symbol,
        "splitDate": normalized_date,
        "ratio": display_ratio,
        "ratioFrom": ratio_from,
        "ratioTo": ratio_to,
        "sources": [source],
        "lastUpdated": last_updated,
    }

    if confidence in CONFIDENCE_RANK:
        event["confidence"] = confidence
    if rounding_up is not None:
        event["roundingUp"] = rounding_up
    if filing_url:
        event["filingUrl"] = filing_url.strip()
    if summary:
        event["summary"] = summary.strip()

    return event


def merge_event(events: dict[tuple[str, str], dict], incoming: dict) -> None:
    key = (incoming["symbol"], incoming["splitDate"])
    existing = events.get(key)
    if not existing:
        events[key] = incoming
        return

    existing["sources"] = sorted(set(existing.get("sources", [])) | set(incoming.get("sources", [])))
    existing["roundingUp"] = bool(existing.get("roundingUp")) or bool(incoming.get("roundingUp"))

    if len(incoming.get("companyName", "")) > len(existing.get("companyName", "")):
        existing["companyName"] = incoming["companyName"]

    current_confidence = existing.get("confidence")
    incoming_confidence = incoming.get("confidence")
    if CONFIDENCE_RANK.get(incoming_confidence, 0) > CONFIDENCE_RANK.get(current_confidence, 0):
        existing["confidence"] = incoming_confidence

    for field in ("filingUrl", "summary"):
        if incoming.get(field) and not existing.get(field):
            existing[field] = incoming[field]

    if incoming.get("summary") and len(incoming["summary"]) > len(existing.get("summary", "")):
        existing["summary"] = incoming["summary"]


def rows_from_csv(path: Path) -> Iterable[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        yield from csv.DictReader(handle)


def load_reverse_split_archive(path: Path, last_updated: str) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for row in rows_from_csv(path):
        split_type = row.get("Type", "")
        if split_type and "reverse" not in split_type.lower():
            continue

        event = build_event(
            symbol=row.get("Symbol", ""),
            company_name=row.get("Company Name", ""),
            split_date=row.get("Date", ""),
            ratio=row.get("Split Ratio", ""),
            source=path.stem,
            last_updated=last_updated,
        )
        if event:
            events.append(event)

    return events


def load_edgar_csv(path: Path, last_updated: str) -> list[dict]:
    events = []
    if not path.exists():
        return events

    for row in rows_from_csv(path):
        split_date = normalize_date(row.get("effective_date")) or normalize_date(row.get("filing_date"))
        if not split_date:
            continue

        event = build_event(
            symbol=row.get("ticker", ""),
            company_name=row.get("company_name", ""),
            split_date=split_date,
            ratio=row.get("ratio", ""),
            source="edgar",
            confidence=row.get("confidence") or None,
            rounding_up=parse_bool(row.get("rounding_up")),
            filing_url=row.get("filing_url") or None,
            summary=row.get("summary") or None,
            last_updated=last_updated,
        )
        if event:
            events.append(event)

    return events


def soup_for_url(url: str):
    import requests
    from bs4 import BeautifulSoup

    response = requests.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def scrape_stockanalysis(last_updated: str) -> list[dict]:
    events = []
    soup = soup_for_url("https://stockanalysis.com/actions/splits/")

    for row in soup.select("table tbody tr"):
        cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
        if len(cells) < 5:
            continue
        event = build_event(
            symbol=cells[1],
            company_name=cells[2],
            split_date=cells[0],
            ratio=cells[4],
            source="stockanalysis",
            last_updated=last_updated,
        )
        if event and "forward" not in cells[3].lower():
            events.append(event)

    return events


def scrape_tipranks(last_updated: str) -> list[dict]:
    events = []
    soup = soup_for_url("https://www.tipranks.com/calendars/stock-splits/upcoming")

    for row in soup.select("table tbody tr"):
        cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
        if len(cells) < 5:
            continue
        event = build_event(
            symbol=cells[1],
            company_name=cells[2],
            split_date=cells[0],
            ratio=cells[4],
            source="tipranks",
            last_updated=last_updated,
        )
        if event and "forward" not in cells[3].lower():
            events.append(event)

    return events


def scrape_hedgefollow(last_updated: str, use_selenium: bool = False) -> list[dict]:
    if use_selenium:
        return scrape_hedgefollow_selenium(last_updated)

    events = []
    soup = soup_for_url("https://hedgefollow.com/upcoming-stock-splits.php")

    for row in soup.select("table tbody tr"):
        cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
        if len(cells) < 5:
            continue
        event = build_event(
            symbol=cells[0],
            company_name=cells[2] if len(cells) > 2 else cells[0],
            split_date=cells[4],
            ratio=cells[3],
            source="hedgefollow",
            last_updated=last_updated,
        )
        if event:
            events.append(event)

    return events


def scrape_hedgefollow_selenium(last_updated: str) -> list[dict]:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    from webdriver_manager.chrome import ChromeDriverManager

    events = []
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    try:
        driver.set_page_load_timeout(120)
        driver.get("https://hedgefollow.com/upcoming-stock-splits.php")
        table = WebDriverWait(driver, 30).until(ec.presence_of_element_located((By.ID, "latest_splits")))

        for row in table.find_elements(By.TAG_NAME, "tr")[1:]:
            cells = [cell.text.strip() for cell in row.find_elements(By.TAG_NAME, "td")]
            if len(cells) < 5:
                continue
            event = build_event(
                symbol=cells[0],
                company_name=cells[2] if len(cells) > 2 else cells[0],
                split_date=cells[4],
                ratio=cells[3],
                source="hedgefollow",
                last_updated=last_updated,
            )
            if event:
                events.append(event)
    finally:
        driver.quit()

    return events


def collect_events(args: argparse.Namespace) -> list[dict]:
    last_updated = datetime.now(timezone.utc).isoformat()
    merged: dict[tuple[str, str], dict] = {}

    for archive_path in args.archive_csv:
        for event in load_reverse_split_archive(Path(archive_path), last_updated):
            merge_event(merged, event)

    if args.edgar_csv:
        for event in load_edgar_csv(Path(args.edgar_csv), last_updated):
            merge_event(merged, event)

    if not args.skip_web:
        scrapers = [
            ("stockanalysis", lambda: scrape_stockanalysis(last_updated)),
            ("tipranks", lambda: scrape_tipranks(last_updated)),
            ("hedgefollow", lambda: scrape_hedgefollow(last_updated, args.hedgefollow_selenium)),
        ]

        for name, scraper in scrapers:
            try:
                for event in scraper():
                    merge_event(merged, event)
            except Exception as exc:
                print(f"Warning: {name} scraper failed: {exc}")

    return sorted(merged.values(), key=lambda event: (event["splitDate"], event["symbol"]))


def write_json(events: list[dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(events, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export reverse split data for Revsplit.")
    parser.add_argument("--output", default="public/data/reverse-splits.json")
    parser.add_argument("--edgar-csv", default="data/split_performance.csv")
    parser.add_argument("--archive-csv", action="append", default=[])
    parser.add_argument("--skip-web", action="store_true")
    parser.add_argument("--hedgefollow-selenium", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    events = collect_events(args)
    write_json(events, Path(args.output))
    print(f"Wrote {len(events)} events to {args.output}")


if __name__ == "__main__":
    main()
