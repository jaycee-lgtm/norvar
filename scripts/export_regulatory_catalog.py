#!/usr/bin/env python3
"""
Merge global + US ingest catalogs into data/regulatory-catalog.json for the Next.js UI.

  python scripts/export_regulatory_catalog.py
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from global_regulations_catalog import GLOBAL_REGULATIONS  # noqa: E402

JSON_PATH = ROOT / "data" / "regulatory-catalog.json"
INGEST_PATH = ROOT / "norvar_ingest.py"

DOMAIN_ORDER = ["privacy", "ai", "cyber"]

JURISDICTION_LABELS = {
    "eu": "EU / EEA",
    "uk": "United Kingdom",
    "us_federal": "US Federal",
    "us_state": "US State & Local",
    "apac": "Asia-Pacific",
    "canada": "Canada",
    "global": "International",
    "latam": "Latin America",
    "mena": "Middle East & Africa",
}

US_JURISDICTION_MAP = {
    "US Federal": "US Federal",
    "US State": "US State & Local",
    "US Local": "US State & Local",
}

STATUS_MAP = {
    "enacted": "in_force",
    "in_force": "in_force",
    "active": "in_force",
    "proposed": "advancing",
    "draft": "advancing",
    "upcoming": "upcoming",
    "watch": "watch",
}


def load_hand_corpus() -> list[dict]:
    text = INGEST_PATH.read_text(encoding="utf-8")
    module = ast.parse(text)
    for node in module.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "HAND_CORPUS":
                    return ast.literal_eval(node.value)
    raise ValueError("HAND_CORPUS not found in norvar_ingest.py")


def jurisdiction_label(raw: str) -> str:
    if raw in US_JURISDICTION_MAP:
        return US_JURISDICTION_MAP[raw]
    return JURISDICTION_LABELS.get(raw, raw.replace("_", " ").title())


def jurisdiction_sort_key(label: str) -> tuple[int, str]:
    order = [
        "EU / EEA",
        "United Kingdom",
        "US Federal",
        "US State & Local",
        "Canada",
        "Asia-Pacific",
        "Latin America",
        "Middle East & Africa",
        "International",
    ]
    try:
        return (order.index(label), label)
    except ValueError:
        return (len(order), label)


def normalize_entry(entry: dict, corpus: str) -> dict:
    abbr = entry["abbr"].strip()
    jurisdiction_raw = entry.get("jurisdiction", "global")
    label = jurisdiction_label(jurisdiction_raw)
    status_raw = str(entry.get("status", "in_force")).lower()
    status = STATUS_MAP.get(status_raw, "in_force")
    source_url = entry.get("url") or entry.get("sourceUrl") or entry.get("source_url") or ""
    notes = entry.get("notes") or entry.get("tagline") or ""

    return {
        "id": f"{corpus}:{abbr}",
        "abbr": abbr,
        "name": entry["name"].strip(),
        "domain": entry["domain"],
        "jurisdiction": jurisdiction_raw,
        "jurisdictionLabel": label,
        "status": status,
        "year": entry.get("year"),
        "sourceUrl": source_url,
        "notes": notes.strip() if isinstance(notes, str) else "",
        "corpus": corpus,
    }


def merge_catalogs() -> list[dict]:
    seen_ids: set[str] = set()
    merged: list[dict] = []

    for entry in GLOBAL_REGULATIONS:
        row = normalize_entry(entry, "global")
        if row["id"] in seen_ids:
            row["id"] = f"{row['id']}-2"
        seen_ids.add(row["id"])
        merged.append(row)

    for entry in load_hand_corpus():
        row = normalize_entry(entry, "us")
        if row["id"] in seen_ids:
            row["id"] = f"{row['id']}-us"
        seen_ids.add(row["id"])
        merged.append(row)

    def sort_key(row: dict) -> tuple:
        domain_idx = DOMAIN_ORDER.index(row["domain"]) if row["domain"] in DOMAIN_ORDER else 99
        return (
            domain_idx,
            jurisdiction_sort_key(row["jurisdictionLabel"]),
            row["name"].lower(),
        )

    merged.sort(key=sort_key)
    return merged


def main() -> int:
    catalog = merge_catalogs()
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    domains = sorted({r["domain"] for r in catalog})
    jurisdictions = sorted({r["jurisdictionLabel"] for r in catalog})
    print(f"Exported {len(catalog)} frameworks → {JSON_PATH}")
    print(f"Domains: {', '.join(domains)}")
    print(f"Jurisdictions: {len(jurisdictions)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
