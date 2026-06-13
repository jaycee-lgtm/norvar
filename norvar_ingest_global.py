#!/usr/bin/env python3
"""
Norvar — Global Regulatory Corpus Extension
Adds international frameworks across Privacy, AI Governance, and Cybersecurity.
Run AFTER norvar_ingest.py to extend the corpus.

Usage:
    python3 norvar_ingest_global.py
    python3 norvar_ingest_global.py --check-urls

Requires same environment variables as norvar_ingest.py (not needed for --check-urls):
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY), VOYAGE_API_KEY
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import ssl
import time
import warnings
from pathlib import Path

import requests
import voyageai
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

from global_regulations_catalog import GLOBAL_REGULATIONS

load_dotenv()
warnings.filterwarnings("ignore")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

CORPUS_VERSION = "global-v1"
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150
TABLE_NAME = "regulatory_chunks"
MIN_TEXT_LEN = 200
REPORT_PATH = Path(__file__).resolve().parent / "global_ingest_fetch_report.json"


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks by sentence boundaries."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    current: list[str] = []
    length = 0

    for sent in sentences:
        if length + len(sent) > size and current:
            chunks.append(" ".join(current))
            while current and length > overlap:
                removed = current.pop(0)
                length -= len(removed)
        current.append(sent)
        length += len(sent)

    if current:
        chunks.append(" ".join(current))

    return [c for c in chunks if len(c) > 80]


def make_id(name: str, idx: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower())[:40].strip("_")
    suffix = hashlib.md5(f"{name}{idx}".encode()).hexdigest()[:8]
    return f"{slug}_{idx:04d}_{suffix}"


def _clean_html_text(raw: str) -> str | None:
    soup = BeautifulSoup(raw, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = text.strip()
    return text if len(text) > MIN_TEXT_LEN else None


def fetch_ssl_relaxed(url: str) -> str | None:
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        import urllib.request

        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, context=ctx, timeout=45) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        return _clean_html_text(raw)
    except Exception:
        return None


def fetch_html(url: str) -> str | None:
    for verify in (True, False):
        try:
            response = requests.get(url, headers=HEADERS, timeout=45, verify=verify)
            text = _clean_html_text(response.text)
            if text:
                return text
        except Exception:
            continue
    return None


def fetch_pdf(url: str) -> str | None:
    try:
        from pypdf import PdfReader

        response = requests.get(url, headers=HEADERS, timeout=45, verify=False)
        response.raise_for_status()
        reader = PdfReader(io.BytesIO(response.content))
        text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        return text if len(text) > MIN_TEXT_LEN else None
    except Exception:
        return None


def fetch_with_fallback(reg: dict) -> tuple[str | None, str]:
    """Fetch regulation text from URL, trying primary then fallback."""
    attempts: list[tuple[str, str, str]] = []
    method = reg.get("fetch_method", "html")
    attempts.append((method, reg["url"], "primary"))
    if "fallback_url" in reg:
        fb_method = reg.get("fallback_method", "html")
        attempts.append((fb_method, reg["fallback_url"], "fallback"))

    for method, url, label in attempts:
        for attempt in range(3):
            if attempt:
                time.sleep(2 * attempt)
            print(f"    Fetching {label}: {url[:90]}")
            text: str | None = None
            if method == "pdf":
                text = fetch_pdf(url)
            elif method == "ssl_relaxed":
                text = fetch_ssl_relaxed(url)
            else:
                text = fetch_html(url)
                if not text:
                    text = fetch_ssl_relaxed(url)
            if text:
                return text, url

    return None, ""


def check_urls() -> int:
    """Fetch-only validation; writes global_ingest_fetch_report.json."""
    results: list[dict] = []
    ok_count = 0
    fail_count = 0

    print("╔══════════════════════════════════════════════════╗")
    print("║   Norvar — Global Corpus URL Check               ║")
    print(f"║   {len(GLOBAL_REGULATIONS)} regulations                              ║")
    print("╚══════════════════════════════════════════════════╝\n")

    for reg in GLOBAL_REGULATIONS:
        print(f"  [{reg['abbr']}] {reg['name'][:60]}")
        text, used_url = fetch_with_fallback(reg)
        chunks = chunk_text(text) if text else []
        status = "ok" if text and chunks else "fetch_failed"
        if status == "ok":
            ok_count += 1
        else:
            fail_count += 1

        results.append(
            {
                "abbr": reg["abbr"],
                "name": reg["name"],
                "domain": reg["domain"],
                "status": status,
                "source_url": used_url or reg["url"],
                "text_length": len(text) if text else 0,
                "chunk_count": len(chunks),
            }
        )
        marker = "OK" if status == "ok" else "FAIL"
        print(f"    → {marker}  text={len(text) if text else 0}  chunks={len(chunks)}\n")
        time.sleep(0.3)

    report = {
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total": len(GLOBAL_REGULATIONS),
        "ok": ok_count,
        "fetch_failed": fail_count,
        "results": results,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"{'═' * 60}")
    print(f"  OK:            {ok_count}")
    print(f"  Fetch failed:  {fail_count}")
    print(f"  Report:        {REPORT_PATH}")
    print(f"{'═' * 60}\n")

    return 0 if fail_count == 0 else 1


def get_clients() -> tuple:
    supabase_url = os.getenv("SUPABASE_URL", "https://YOUR_PROJECT.supabase.co")
    supabase_key = os.getenv("SUPABASE_KEY") or os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY",
        "YOUR_SUPABASE_SERVICE_ROLE_KEY",
    )
    voyage_key = os.getenv("VOYAGE_API_KEY", "YOUR_VOYAGE_API_KEY")
    return create_client(supabase_url, supabase_key), voyageai.Client(api_key=voyage_key)


def embed_batch(voyage: voyageai.Client, texts: list[str]) -> list[list[float]]:
    result = voyage.embed(
        texts,
        model="voyage-3-large",
        input_type="document",
        output_dimension=1024,
    )
    return result.embeddings


def ingest_regulation(reg: dict, supabase, voyage) -> int:
    """Fetch, chunk, embed, and upsert a single regulation. Returns chunk count."""
    print(f"\n  [{reg['abbr']}] {reg['name']}")

    text, source_url = fetch_with_fallback(reg)
    if not text:
        print("  SKIP — could not fetch text")
        return 0

    chunks = chunk_text(text)
    if not chunks:
        print("  SKIP — no usable chunks")
        return 0

    print(f"  {len(chunks)} chunks — embedding...")

    embeddings: list[list[float]] = []
    for i in range(0, len(chunks), 8):
        batch = chunks[i : i + 8]
        embeddings.extend(embed_batch(voyage, batch))
        time.sleep(0.3)

    rows = []
    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        rows.append(
            {
                "id": make_id(reg["abbr"], idx),
                "reg_name": reg["name"],
                "reg_abbr": reg["abbr"],
                "domain": reg["domain"],
                "subdomain": reg.get("subdomain", ""),
                "jurisdiction": reg.get("jurisdiction", "global"),
                "state": reg.get("state"),
                "status": reg.get("status", "enacted"),
                "year": reg.get("year"),
                "chunk_index": idx,
                "chunk_text": chunk,
                "embedding": embedding,
                "source_url": source_url,
                "notes": reg.get("notes", ""),
                "corpus_version": CORPUS_VERSION,
            }
        )

    for i in range(0, len(rows), 50):
        supabase.table(TABLE_NAME).upsert(rows[i : i + 50]).execute()

    print(f"  Ingested {len(rows)} chunks")
    return len(rows)


def ingest_all() -> None:
    supabase, voyage = get_clients()

    print("╔══════════════════════════════════════════════════╗")
    print("║   Norvar — Global Corpus Ingest                  ║")
    print(f"║   {len(GLOBAL_REGULATIONS)} regulations across Privacy, AI, Cyber  ║")
    print("╚══════════════════════════════════════════════════╝\n")

    total_chunks = 0
    failed: list[str] = []

    by_domain: dict[str, list[dict]] = {"privacy": [], "ai": [], "cyber": []}
    for reg in GLOBAL_REGULATIONS:
        by_domain[reg["domain"]].append(reg)

    for domain, regs in by_domain.items():
        print(f"\n{'═' * 60}")
        print(f"  {domain.upper()} — {len(regs)} frameworks")
        print(f"{'═' * 60}")
        for reg in regs:
            try:
                count = ingest_regulation(reg, supabase, voyage)
                if count == 0:
                    failed.append(reg["abbr"])
                total_chunks += count
                time.sleep(1.0)
            except Exception as exc:
                print(f"  ERROR on {reg['abbr']}: {exc}")
                failed.append(reg["abbr"])

    print(f"\n\n{'═' * 60}")
    print("  COMPLETE")
    print(f"  Total chunks ingested: {total_chunks}")
    print(f"  Failed:                {len(failed)}")
    if failed:
        print(f"  Failed frameworks:     {', '.join(failed)}")
    print(f"{'═' * 60}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Norvar global regulatory corpus ingest")
    parser.add_argument(
        "--check-urls",
        action="store_true",
        help="Fetch-only validation; writes global_ingest_fetch_report.json and exits",
    )
    args = parser.parse_args()

    if args.check_urls:
        raise SystemExit(check_urls())

    ingest_all()


if __name__ == "__main__":
    main()
