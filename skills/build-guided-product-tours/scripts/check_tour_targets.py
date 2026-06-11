#!/usr/bin/env python3
"""Check elementId references in a JavaScript tour against IDs in HTML."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


ELEMENT_ID_RE = re.compile(r"""\belementId\s*:\s*(['"])(?P<id>[^'"]+)\1""")


class IdCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name == "id" and value:
                self.ids.append(value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate JavaScript elementId tour targets against HTML IDs."
    )
    parser.add_argument("tour_file", type=Path)
    parser.add_argument("html_file", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    tour_text = args.tour_file.read_text(encoding="utf-8")
    html_text = args.html_file.read_text(encoding="utf-8")

    targets = [match.group("id") for match in ELEMENT_ID_RE.finditer(tour_text)]
    collector = IdCollector()
    collector.feed(html_text)

    html_ids = set(collector.ids)
    missing = sorted(set(targets) - html_ids)
    duplicate_html_ids = sorted(
        html_id for html_id in html_ids if collector.ids.count(html_id) > 1
    )

    print(f"Tour targets: {len(targets)} ({len(set(targets))} unique)")
    print(f"HTML IDs: {len(collector.ids)} ({len(html_ids)} unique)")

    if duplicate_html_ids:
        print("Duplicate HTML IDs:", ", ".join(duplicate_html_ids))
    if missing:
        print("Missing tour targets:", ", ".join(missing))

    if not targets:
        print("No elementId targets found.", file=sys.stderr)
        return 2
    if missing or duplicate_html_ids:
        return 1

    print("All elementId tour targets exist and HTML IDs are unique.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
