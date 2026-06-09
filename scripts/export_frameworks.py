#!/usr/bin/env python3
"""
Export src/lib/frameworks.ts → data/frameworks.json

Run after editing the TypeScript framework library so norvar_inference.py
stays in sync with the Next.js corpus.

  python scripts/export_frameworks.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TS_PATH = ROOT / "src" / "lib" / "frameworks.ts"
JSON_PATH = ROOT / "data" / "frameworks.json"


def _strip_comments(text: str) -> str:
    # Only full-line comments — avoid stripping https:// in sourceUrl values.
    return re.sub(r"^\s*//.*$", "", text, flags=re.MULTILINE)


def _quote_keys(text: str) -> str:
    return re.sub(r"(?m)^(\s*)([a-zA-Z_]\w*)\s*:", r'\1"\2":', text)


def _remove_trailing_commas(text: str) -> str:
    return re.sub(r",(\s*[}\]])", r"\1", text)


def extract_frameworks_array(ts_source: str) -> str:
    match = re.search(
        r"export const FRAMEWORKS[^=]*=\s*(\[.*?\]);\s*\n\n// ── Lookup",
        ts_source,
        re.DOTALL,
    )
    if not match:
        raise ValueError("Could not find FRAMEWORKS array in frameworks.ts")
    return match.group(1)


def parse_frameworks(ts_source: str) -> list[dict]:
    array_text = extract_frameworks_array(ts_source)
    array_text = _strip_comments(array_text)
    array_text = _quote_keys(array_text)
    array_text = _remove_trailing_commas(array_text)
    return json.loads(array_text)


def main() -> int:
    if not TS_PATH.exists():
        print(f"Error: {TS_PATH} not found", file=sys.stderr)
        return 1

    ts_source = TS_PATH.read_text(encoding="utf-8")
    frameworks = parse_frameworks(ts_source)

    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(
        json.dumps(frameworks, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    domains = sorted({f["domain"] for f in frameworks})
    print(f"Exported {len(frameworks)} frameworks → {JSON_PATH}")
    print(f"Domains: {', '.join(domains)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
