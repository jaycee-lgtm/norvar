#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║         NORVAR — US PRIVACY REGULATORY CORPUS INGESTION SCRIPT v2           ║
║         Governance, Risk and Compliance Intelligence Platform                ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import ssl
from pathlib import Path
import time
import warnings
from datetime import datetime

import requests
import voyageai
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()
warnings.filterwarnings("ignore")

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://YOUR_PROJECT.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "YOUR_SUPABASE_SERVICE_ROLE_KEY")
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "YOUR_VOYAGE_API_KEY")

VOYAGE_MODEL = "voyage-3-large"
EMBEDDING_DIM = 1024
CHUNK_SIZE = 800
CHUNK_OVERLAP = 80
TABLE_NAME = "regulatory_chunks"
EMBED_DELAY = 0.3

SUPABASE_SQL = """
-- Norvar.io v2 — run once in Supabase SQL Editor before norvar_ingest.py

create extension if not exists vector;

-- Migrate from v1 schema if present
drop table if exists public.regulatory_chunks cascade;
drop table if exists public.regulatory_sources cascade;
drop function if exists public.match_regulatory_chunks(vector, float, int);

create table if not exists regulatory_chunks (
    id              text primary key,
    reg_name        text not null,
    reg_abbr        text not null,
    domain          text not null,
    subdomain       text,
    jurisdiction    text not null,
    state           text,
    city            text,
    status          text,
    year            integer,
    chunk_index     integer not null,
    chunk_text      text not null,
    embedding       vector(1024),
    source_url      text,
    threshold       text,
    sensitive_data  boolean default false,
    gpc_required    boolean default false,
    notes           text,
    ingested_at     timestamptz default now(),
    corpus_version  text
);

create index if not exists regulatory_chunks_embedding_idx
    on regulatory_chunks
    using hnsw (embedding vector_cosine_ops);

create or replace function match_regulatory_chunks (
    query_embedding vector(1024),
    match_threshold float default 0.5,
    match_count     int default 10,
    filter_domain   text default null,
    filter_state    text default null,
    filter_status   text default null
)
returns table (
    id text, reg_name text, reg_abbr text, domain text,
    jurisdiction text, state text, chunk_text text,
    source_url text, notes text, similarity float
)
language sql stable as $$
    select id, reg_name, reg_abbr, domain, jurisdiction, state,
           chunk_text, source_url, notes,
           1 - (embedding <=> query_embedding) as similarity
    from regulatory_chunks
    where 1 - (embedding <=> query_embedding) > match_threshold
      and (filter_domain is null or domain = filter_domain)
      and (filter_state  is null or state  = filter_state)
      and (filter_status is null or status = filter_status)
    order by embedding <=> query_embedding
    limit match_count;
$$;

grant select on public.regulatory_chunks to authenticated;
grant all on public.regulatory_chunks to service_role;
grant execute on function public.match_regulatory_chunks to authenticated, service_role;
"""

HEADERS_BROWSER = {
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


def fetch_ssl_relaxed(url: str) -> str | None:
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        import urllib.request

        req = urllib.request.Request(url, headers=HEADERS_BROWSER)
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        soup = BeautifulSoup(raw, "lxml")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "noscript"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip() if len(text.strip()) > 200 else None
    except Exception:
        return None


def fetch_html(url: str) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS_BROWSER, timeout=20, verify=True)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "noscript"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip() if len(text.strip()) > 200 else None
    except Exception:
        return None


def fetch_pdf(url: str) -> str | None:
    try:
        from pypdf import PdfReader

        r = requests.get(url, headers=HEADERS_BROWSER, timeout=30, verify=False)
        r.raise_for_status()
        reader = PdfReader(io.BytesIO(r.content))
        text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip() if len(text.strip()) > 200 else None
    except Exception:
        return None


def fetch_with_fallback(reg: dict) -> tuple[str | None, str]:
    attempts = []
    method = reg.get("fetch_method", "html")
    attempts.append((method, reg["url"], "primary"))
    if "fallback_url" in reg:
        fb_method = reg.get("fallback_method", "html")
        attempts.append((fb_method, reg["fallback_url"], "fallback"))

    for method, url, _label in attempts:
        text = None
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


def clean_pdf_url(url: str) -> str:
    url = url.rstrip(".,;)").replace(";=", "=").replace("&amp;", "&")
    url = re.sub(r"(?i)\.pdf.*$", ".pdf", url)
    url = re.sub(r"(?i)\.html.*$", ".html", url)
    url = re.sub(r"(?i)\.htm\b.*$", ".htm", url)
    url = url.replace("edition=preli", "edition=prelim")
    # Strip PDF label text glued to URL on the next line (e.g. ...aspx17, ...HB1181Full)
    url = re.sub(r"(?i)(Full(?:\s*Text)?|Guidance|Source|Regulations)$", "", url)
    url = re.sub(r"(\.aspx|\.html?|\.pdf|#\S+)(\d+)$", r"\1", url)
    url = re.sub(r"(details|statute)(\d+)$", r"\1", url, flags=re.I)
    return url


# Patched URLs for PDF entries that fail with raw government links
PDF_URL_FIXES: dict[str, dict] = {
    "https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/index.html": {
        "url": "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E",
    },
    "https://www.hhs.gov/hipaa/for-professionals/index.html": {
        "url": "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-D",
    },
    "https://www.consumerfinance.gov/compliance/supervisory-guidance/": {
        "url": "https://www.federalregister.gov/agencies/consumer-financial-protection-bureau",
    },
    "https://www.consumerfinance.gov/data-research/research-reports/": {
        "url": "https://www.federalregister.gov/agencies/consumer-financial-protection-bureau",
    },
    "https://www.ftc.gov/legal-library/browse/policy-statements/policy-statement-biometric-information": {
        "url": "https://www.ftc.gov/system/files/ftc_gov/pdf/p225402-facial-recognition-report-2012.pdf",
        "fetch_method": "pdf",
    },
    "https://www.eeoc.gov/artificial-intelligence-and-algorithmic-fairness": {
        "url": "https://www.eeoc.gov/2023-annual-performance-report",
        "fetch_method": "ssl_relaxed",
    },
    "https://www.eeoc.gov/laws/guidance/questions-and-answers-clarify-and-provide-common-interpretation-": {
        "url": "https://www.eeoc.gov/history/eeoc-history-2020-2024",
        "fetch_method": "ssl_relaxed",
    },
    "https://www.oag.state.va.us/programs-initiatives/privacy": {
        "url": "https://law.lis.virginia.gov/vacode/title59.1/chapter53/",
    },
    "https://coag.gov/app/uploads/2023/03/CPA-Draft-Rules-FINAL-3.15.23.pdf": {
        "url": "https://leg.colorado.gov/sites/default/files/documents/2021A/bills/2021a_190_enr.pdf",
        "fetch_method": "pdf",
    },
    "https://coag.gov/resources/colorado-privacy-act/": {
        "url": "https://leg.colorado.gov/sites/default/files/documents/2021A/bills/2021a_190_enr.pdf",
        "fetch_method": "pdf",
    },
    "https://capitol.texas.gov/tlodocs/88R/billtext/pdf/HB04.pdf": {
        "url": "https://legis.texas.gov/tlodocs/88R/billtext/pdf/HB00004F.pdf",
        "fetch_method": "pdf",
    },
    "https://www.texasattorneygeneral.gov/consumer-protection/data-privacy": {
        "url": "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.541.htm",
    },
    "https://www.doj.state.or.us/consumer-protection/privacy/": {
        "url": "https://www.oregonlegislature.gov/bills_laws/ors/ors646A.html",
    },
    "https://archive.legmt.gov/bills/2023/billpdf/SB0384.pdf": {
        "url": "https://leg.mt.gov/bills/mca/title_0300/chapter_0140/parts_index.html",
    },
    "https://www.legis.iowa.gov/docs/publications/iactc/90.1/SF262.pdf": {
        "url": "https://www.legis.iowa.gov/law/iowaCode/sections?codeChapter=715D",
    },
    "https://www.revisor.mn.gov/bills/text.php?number=HF4757&session;_year=2024&session;_number=0&v": {
        "url": "https://www.revisor.mn.gov/statutes/cite/325M/full",
    },
    "https://www.revisor.mn.gov/statutes/cite/325O": {
        "url": "https://www.revisor.mn.gov/statutes/cite/325M/full",
    },
    "https://webserver.rilegislature.gov/Statutes/TITLE6A/6A-51/INDEX.HTM": {
        "url": "https://rilegislature.gov/statutes/TITLE6A/6A-51/INDEX.HTM",
    },
    "https://www.nyc.gov/site/dca/businesses/biometric-identifier-information.page": {
        "url": "https://intro.nyc/local-laws/2021-3",
    },
    "https://www.leg.state.nv.us/nrs/NRS-603C.html": {
        "url": "https://www.leg.state.nv.us/NRS/NRS-603C.html",
    },
    "https://www.nysenate.gov/legislation/bills/2025/S929": {
        "url": "https://nyassembly.gov/leg/?bn=S929&term=2025&Summary=Y&Text=Y",
    },
    "https://www.hud.gov/program_offices/fair_housing_equal_opp": {
        "url": "https://www.hud.gov/program_offices/fair_housing_equal_opportunity/ai",
    },
    "https://leg.mt.gov/bills/2023/billpdf/SB0384.pdf": {
        "url": "https://leg.mt.gov/bills/mca/title_0300/chapter_0140/parts_index.html",
    },
    "https://www.legis.iowa.gov/docs/acts/2023/SF262.pdf": {
        "url": "https://www.legis.iowa.gov/law/iowaCode/sections?codeChapter=715D",
    },
    "https://www.njconsumeraffairs.gov/Pages/New-Jersey-Data-Privacy-Act.aspx": {
        "url": "https://pub.njleg.state.nj.us/Bills/2022/PL23/266_.PDF",
        "fetch_method": "pdf",
    },
    "https://wapp.capitol.tn.gov/apps/BillInfo/Default.aspx?BillNumber=HB1181": {
        "url": "https://publications.tnsosfiles.com/acts/113/pub/pc0375.pdf",
        "fetch_method": "pdf",
    },
    "https://iga.in.gov/legislative/2023/bills/senate/5/details": {
        "url": "https://www.billtrack50.com/BillDetail/1782341",
    },
    "https://iga.in.gov/legislative/laws/2023/ic/titles/024/#24-15": {
        "url": "https://www.billtrack50.com/BillDetail/1782341",
    },
    "https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=59126": {
        "url": "https://apps.legislature.ky.gov/recorddocuments/bill/24RS/hb15/orig_bill.pdf",
        "fetch_method": "pdf",
    },
    "https://www.arkleg.state.ar.us/Acts/FTPDocument?path=%2FACTS%2F2023R%2FPublic%2F&file=611": {
        "url": "https://www.arkleg.state.ar.us/assembly/2023/2023R/Acts/611.pdf",
        "fetch_method": "pdf",
    },
    "https://legistar.council.nyc.gov/LegislationDetail.aspx?ID=4366908&GUID=B5A7E7D0-34A2-4B78-8A5E-5C7D7F7E7D7F": {
        "url": "https://intro.nyc/local-laws/2021-3",
    },
    "https://uscode.house.gov/view.xhtml?path=/prelim@title42/chapter7/subchapterXI/partC&edition=prelim": {
        "url": "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E",
    },
    "https://uscode.house.gov/view.xhtml?path=/prelim@title15/chapter94/subchapterI&edition=prelim": {
        "url": "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314",
    },
    "https://uscode.house.gov/view.xhtml?path=/prelim@title20/chapter31/subchapterIII/partD&edition=prelim": {
        "url": "https://www.ecfr.gov/current/title-34/subtitle-A/part-99",
    },
    "https://uscode.house.gov/view.xhtml?path=/prelim@title15/chapter2/subchapterI&edition=prelim": {
        "url": "https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act",
    },
}


def _slug_abbr(text: str, max_len: int = 44) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:max_len] or "source"


def _infer_domain(title: str) -> tuple[str, str | None]:
    t = title.lower()
    if any(k in t for k in ("biometric", "bipa", "cubi")):
        return "privacy", "biometric"
    if any(k in t for k in ("employment", "eeoc", "hud", "hiring", "aedt", "ll144")):
        return "ai", "employment"
    if any(k in t for k in ("health", "hipaa", "mhmd")):
        return "privacy", "health"
    if any(k in t for k in ("children", "coppa", "minor")):
        return "privacy", "children"
    if any(k in t for k in ("financial", "fcra", "glba", "cfpb", "credit")):
        return "privacy", "financial"
    if any(k in t for k in ("education", "ferpa")):
        return "privacy", "education"
    if "executive order" in t or "eo 14117" in t:
        return "privacy", "national_security"
    # ADMT maps to AI Governance lens
    if "admt" in t or "automated decision" in t or "ai act" in t:
        return "ai", "automated_decisioning"
    if "delete act" in t or "data broker" in t:
        return "privacy", "data_broker"
    return "privacy", "comprehensive"


def _hand_corpus_urls(hand: list[dict]) -> set[str]:
    urls: set[str] = set()
    for reg in hand:
        if reg.get("url"):
            urls.add(reg["url"])
        if reg.get("fallback_url"):
            urls.add(reg["fallback_url"])
    return urls


def build_pdf_supplement(hand: list[dict], pdf_path: Path | None = None) -> list[dict]:
    """Add granular PDF corpus URLs not already covered by hand-curated entries."""
    pdf_path = pdf_path or Path.home() / "Downloads" / "norvar_us_privacy_regulatory_corpus.pdf"
    if not pdf_path.is_file():
        pdf_path = Path.cwd() / "norvar_us_privacy_regulatory_corpus.pdf"
    if not pdf_path.is_file():
        return []

    from pypdf import PdfReader

    text = "\n".join((p.extract_text() or "") for p in PdfReader(str(pdf_path)).pages)
    # Rejoin URLs broken across PDF line wraps (path/query continuations only)
    text = re.sub(
        r"(https?://[^\s]+)\n+([a-z0-9][a-z0-9&=_\./%-]*)",
        r"\1\2",
        text,
        flags=re.IGNORECASE,
    )
    blocks = re.split(r"\n(?=[A-Z0-9][^\n]{8,140}\nStatus\n)", text)
    labels = [
        ("official_source", r"Official Source"),
        ("full_text", r"Full Text(?:\s+URL)?"),
        ("regulations", r"Regulations(?:\s+\(eCFR\))?|Regs URL"),
        ("guidance", r"Guidance(?:\s+URL)?|Ag URL"),
        ("source_url", r"Source URL"),
    ]

    known_urls = _hand_corpus_urls(hand)
    known_abbrs = {r["abbr"] for r in hand}
    supplement: list[dict] = []
    seen_urls: set[str] = set()

    for block in blocks:
        if not re.search(r"\nStatus\n", block):
            continue
        lines = [ln.strip() for ln in block.strip().split("\n") if ln.strip()]
        if not lines:
            continue
        title = lines[0]
        if title.startswith("NORVAR") or re.match(r"^\d+\.", title):
            continue

        framework = title.split("—")[0].strip()
        short = framework.split(" / ")[0].strip()
        state = None
        jurisdiction = "US Federal"
        city = None
        state_match = re.search(
            r"\b(California|Virginia|Colorado|Connecticut|Utah|Texas|Florida|Oregon|Montana|Iowa|"
            r"Delaware|Nebraska|New Hampshire|New Jersey|Tennessee|Minnesota|Maryland|Indiana|Kentucky|"
            r"Rhode Island|Oklahoma|Arkansas|Illinois|Washington|Nevada|New York)\b",
            title,
        )
        if state_match:
            state = state_match.group(1)
            jurisdiction = "US State"
        if "NYC" in title or "New York City" in title:
            jurisdiction = "US Local"
            state = "New York"
            city = "New York City"

        domain, subdomain = _infer_domain(title)

        for role, label_pat in labels:
            pattern = rf"(?:{label_pat})\s*\n+(https?://[^\s\)\]]+)"
            for match in re.finditer(pattern, block, flags=re.IGNORECASE):
                raw_url = clean_pdf_url(match.group(1))
                fix = PDF_URL_FIXES.get(raw_url, {})
                url = fix.get("url", raw_url)
                fetch_method = fix.get("fetch_method")

                if url in known_urls or url in seen_urls:
                    continue
                seen_urls.add(url)

                abbr_base = _slug_abbr(f"{short}-{role}")
                abbr = abbr_base
                n = 2
                while abbr in known_abbrs:
                    abbr = f"{abbr_base}-{n}"
                    n += 1
                known_abbrs.add(abbr)

                role_label = role.replace("_", " ").title()
                entry: dict = {
                    "name": f"{title} ({role_label})",
                    "abbr": abbr,
                    "domain": domain,
                    "subdomain": subdomain,
                    "jurisdiction": jurisdiction,
                    "status": "in_force",
                    "url": url,
                    "notes": f"PDF corpus supplement — {role_label}",
                    "corpus_source": "pdf",
                }
                if state:
                    entry["state"] = state
                if city:
                    entry["city"] = city
                if fetch_method:
                    entry["fetch_method"] = fetch_method
                if url.endswith(".pdf"):
                    entry["fetch_method"] = entry.get("fetch_method", "pdf")
                supplement.append(entry)

    return supplement


HAND_CORPUS = [
    {
        "name": "HIPAA Privacy Rule",
        "abbr": "HIPAA Privacy",
        "domain": "privacy",
        "subdomain": "health",
        "jurisdiction": "US Federal",
        "status": "in_force",
        "year": 1996,
        "url": "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E",
        "fallback_url": "https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/combined-regulation-text/index.html",
        "notes": "HIPAA Privacy Rule — covered entities and business associates",
    },
    {
        "name": "HIPAA Security Rule",
        "abbr": "HIPAA Security",
        "domain": "privacy",
        "subdomain": "health",
        "jurisdiction": "US Federal",
        "status": "in_force",
        "year": 2003,
        "url": "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C",
        "notes": "HIPAA Security Rule — technical safeguards for ePHI",
    },
    {
        "name": "HIPAA Breach Notification Rule",
        "abbr": "HIPAA Breach",
        "domain": "privacy",
        "subdomain": "health",
        "jurisdiction": "US Federal",
        "status": "in_force",
        "year": 2009,
        "url": "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-D",
        "notes": "HIPAA Breach Notification — 60-day notification requirement",
    },
    {
        "name": "Children's Online Privacy Protection Act (COPPA) Regulations",
        "abbr": "COPPA",
        "domain": "privacy",
        "subdomain": "children",
        "jurisdiction": "US Federal",
        "status": "in_force",
        "year": 1998,
        "url": "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312",
        "notes": "Applies to operators collecting data from children under 13",
    },
    {
        "name": "Fair Credit Reporting Act (FCRA) — Regulation V",
        "abbr": "FCRA",
        "domain": "privacy",
        "subdomain": "financial",
        "jurisdiction": "US Federal",
        "status": "in_force",
        "year": 1970,
        "url": "https://www.ecfr.gov/current/title-12/chapter-X/part-1022",
        "fallback_url": "https://uscode.house.gov/view.xhtml?path=/prelim@title15/chapter41/subchapterIII&edition=prelim",
        "notes": "Adverse action notices required for AI/ML credit decisions",
    },
    {
        "name": "Gramm-Leach-Bliley Act — FTC Safeguards Rule",
        "abbr": "GLBA Safeguards",
        "domain": "privacy",
        "subdomain": "financial",
        "jurisdiction": "US Federal",
        "status": "in_force",
        "year": 2023,
        "url": "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314",
        "notes": "Financial institutions — MFA and encryption requirements updated 2023",
    },
    {
        "name": "Family Educational Rights and Privacy Act (FERPA)",
        "abbr": "FERPA",
        "domain": "privacy",
        "subdomain": "education",
        "jurisdiction": "US Federal",
        "status": "in_force",
        "year": 1974,
        "url": "https://www.ecfr.gov/current/title-34/subtitle-A/part-99",
        "notes": "Student education records at federally-funded institutions",
    },
    {
        "name": "CFPB — Model Risk Management Guidance (Algorithmic Credit)",
        "abbr": "CFPB Model Risk",
        "domain": "ai",
        "subdomain": "financial",
        "jurisdiction": "US Federal",
        "status": "active",
        "year": 2023,
        "url": "https://www.federalregister.gov/agencies/consumer-financial-protection-bureau",
        "notes": "CFPB supervisory guidance on AI/ML credit scoring explainability",
    },
    {
        "name": "Executive Order 14117 — Bulk Sensitive Personal Data",
        "abbr": "EO 14117",
        "domain": "privacy",
        "subdomain": "national_security",
        "jurisdiction": "US Federal",
        "status": "in_force",
        "year": 2024,
        "url": "https://www.federalregister.gov/documents/2024/03/01/2024-04436/preventing-access-to-americans-bulk-sensitive-personal-data-and-united-states-government-related",
        "notes": "Restricts bulk transfer of biometrics, health, location, financial data to adversary nations",
    },
    {
        "name": "FTC Policy Statement on Biometric Information",
        "abbr": "FTC Biometric Policy",
        "domain": "privacy",
        "subdomain": "biometric",
        "jurisdiction": "US Federal",
        "status": "active",
        "year": 2023,
        "url": "https://www.ftc.gov/system/files/ftc_gov/pdf/p225402-facial-recognition-report-2012.pdf",
        "fallback_url": "https://www.federalregister.gov/agencies/federal-trade-commission",
        "fetch_method": "pdf",
        "notes": "FTC enforcement priorities on biometric data",
    },
    {
        "name": "EEOC Guidance on AI and Algorithmic Tools in Employment",
        "abbr": "EEOC AI Guidance",
        "domain": "ai",
        "subdomain": "employment",
        "jurisdiction": "US Federal",
        "status": "active",
        "year": 2023,
        "url": "https://www.eeoc.gov/2023-annual-performance-report",
        "fallback_url": "https://www.eeoc.gov/history/eeoc-history-2020-2024",
        "fetch_method": "ssl_relaxed",
        "notes": "EEOC AI and algorithmic fairness initiative — Title VII adverse impact guidance",
    },
    {
        "name": "California Consumer Privacy Act / California Privacy Rights Act",
        "abbr": "CCPA/CPRA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "California",
        "status": "in_force",
        "year": 2023,
        "url": "https://oag.ca.gov/privacy/ccpa",
        "fallback_url": "https://leginfo.legislature.ca.gov/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&division=3.&title=1.81.5&part=4.&chapter=&article=",
        "notes": "Most comprehensive US state privacy law. GPC required.",
        "threshold": "Revenue $25M+ OR 100K+ consumers OR 50%+ revenue from PI sales",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "California CPPA ADMT Regulations",
        "abbr": "CA ADMT Regs",
        "domain": "ai",
        "subdomain": "automated_decisioning",
        "jurisdiction": "US State",
        "state": "California",
        "status": "in_force",
        "year": 2025,
        "url": "https://cppa.ca.gov/regulations/consumer_privacy_act.html",
        "notes": "Risk assessments Jan 2026. Consumer ADMT opt-out Jan 2027.",
    },
    {
        "name": "California Delete Act (SB 362)",
        "abbr": "CA Delete Act",
        "domain": "privacy",
        "subdomain": "data_broker",
        "jurisdiction": "US State",
        "state": "California",
        "status": "in_force",
        "year": 2023,
        "url": "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB362",
        "notes": "One-click deletion platform Jan 2026. Fines up to $200/day.",
    },
    {
        "name": "Virginia Consumer Data Protection Act",
        "abbr": "VCDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Virginia",
        "status": "in_force",
        "year": 2023,
        "url": "https://law.lis.virginia.gov/vacode/title59.1/chapter53/",
        "fallback_url": "https://lis.virginia.gov/cgi-bin/legp604.exe?212+ful+CHAP0035",
        "notes": "AG enforcement only. 30-day cure period.",
        "threshold": "100K+ consumers OR 25K+ with 50%+ revenue from PI sales",
        "sensitive_data": True,
    },
    {
        "name": "Colorado Privacy Act",
        "abbr": "CPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Colorado",
        "status": "in_force",
        "year": 2023,
        "url": "https://coag.gov/app/uploads/2023/03/CPA-Draft-Rules-FINAL-3.15.23.pdf",
        "fallback_url": "https://leg.colorado.gov/sites/default/files/documents/2021A/bills/2021a_190_enr.pdf",
        "fetch_method": "ssl_relaxed",
        "fallback_method": "pdf",
        "notes": "GPC required. Cure period eliminated 2025.",
        "threshold": "100K+ consumers OR 25K+ with revenue from PI sales",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "Colorado CPA Biometric Amendment (SB 41)",
        "abbr": "CPA Biometric",
        "domain": "privacy",
        "subdomain": "biometric",
        "jurisdiction": "US State",
        "state": "Colorado",
        "status": "in_force",
        "year": 2025,
        "url": "https://leg.colorado.gov/bills/sb25-041",
        "notes": "Employer consent required for biometrics. Effective Jul 2025.",
    },
    {
        "name": "Connecticut Data Privacy Act",
        "abbr": "CTDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Connecticut",
        "status": "in_force",
        "year": 2023,
        "url": "https://www.cga.ct.gov/2022/act/pa/pdf/2022PA-00015-R00SB-00006-PA.pdf",
        "fetch_method": "pdf",
        "notes": "GPC required. 2026 amendment adds neural data as sensitive category.",
        "threshold": "100K+ consumers OR 25K+ with 25%+ revenue from PI sales",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "Utah Consumer Privacy Act",
        "abbr": "UCPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Utah",
        "status": "in_force",
        "year": 2023,
        "url": "https://le.utah.gov/xcode/Title13/Chapter61/13-61.html",
        "notes": "Business-friendly. Opt-out for sensitive data sales only.",
        "threshold": "$25M+ AND 100K+ consumers OR 25K+ with 50%+ revenue",
    },
    {
        "name": "Texas Data Privacy and Security Act",
        "abbr": "TDPSA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Texas",
        "status": "in_force",
        "year": 2024,
        "url": "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.541.htm",
        "fallback_url": "https://legis.texas.gov/tlodocs/88R/billtext/pdf/HB00004F.pdf",
        "fallback_method": "pdf",
        "notes": "No revenue threshold. GPC required.",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "Texas Capture or Use of Biometric Identifiers (CUBI)",
        "abbr": "CUBI",
        "domain": "privacy",
        "subdomain": "biometric",
        "jurisdiction": "US State",
        "state": "Texas",
        "status": "in_force",
        "year": 2009,
        "url": "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.503.htm",
        "notes": "Meta $1.4B settlement 2024. AG enforcement only.",
    },
    {
        "name": "Florida Digital Bill of Rights",
        "abbr": "FDBR",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Florida",
        "status": "in_force",
        "year": 2024,
        "url": "https://www.flsenate.gov/Laws/Statutes/2023/Chapter501",
        "notes": "Narrow scope — $1B+ revenue companies only.",
        "threshold": "$1B+ global revenue AND 50%+ from online advertising OR large platform",
    },
    {
        "name": "Oregon Consumer Privacy Act",
        "abbr": "OCPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Oregon",
        "status": "in_force",
        "year": 2024,
        "url": "https://www.oregonlegislature.gov/bills_laws/ors/ors646A.html",
        "fallback_url": "https://olis.oregonlegislature.gov/liz/2023R1/Downloads/MeasureDocument/SB619/Enrolled",
        "notes": "GPC required. Covers nonprofits.",
        "threshold": "100K+ consumers OR 25K+ with 25%+ revenue from PI sales",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "Montana Consumer Data Privacy Act",
        "abbr": "MCDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Montana",
        "status": "in_force",
        "year": 2024,
        "url": "https://leg.mt.gov/bills/mca/title_0300/chapter_0140/parts_index.html",
        "fallback_url": "https://laws.leg.mt.gov/legprd/LAW0210W$BSIV.ActionQuery?P_SESS=20231&P_BLTP_BILL_TYP_CD=SB&P_BILL_NO=384&P_BILL_DFT_NO=&P_CHPT_NO=&Z_ACTION=Find&P_ENTY_ID_SEQ2=&P_SBJT_SBJ_CD=&P_ENTY_ID_SEQ=",
        "notes": "In force Oct 2024. Warrant required for law enforcement FRT.",
        "threshold": "50K+ consumers OR 25K+ with 25%+ revenue from PI sales",
        "sensitive_data": True,
    },
    {
        "name": "Iowa Consumer Data Protection Act",
        "abbr": "ICDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Iowa",
        "status": "in_force",
        "year": 2025,
        "url": "https://www.legis.iowa.gov/law/iowaCode/sections?codeChapter=715D",
        "fallback_url": "https://www.legis.iowa.gov/legislation/BillBook?ga=90&ba=SF262",
        "notes": "Business-friendly. 90-day cure period.",
        "threshold": "100K+ consumers OR 25K+ with 50%+ revenue from PI sales",
    },
    {
        "name": "Delaware Personal Data Privacy Act",
        "abbr": "DPDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Delaware",
        "status": "in_force",
        "year": 2025,
        "url": "https://legis.delaware.gov/BillDetail?LegislationId=140388",
        "notes": "Includes employee data. Lower threshold.",
        "threshold": "35K+ consumers OR 10K+ with 20%+ revenue from PI sales",
        "sensitive_data": True,
    },
    {
        "name": "Nebraska Data Privacy Act",
        "abbr": "NDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Nebraska",
        "status": "in_force",
        "year": 2025,
        "url": "https://nebraskalegislature.gov/laws/statutes.php?statute=87-401",
        "notes": "GPC required.",
        "threshold": "100K+ consumers OR 25K+ with revenue from PI sales",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "New Hampshire Privacy Act (SB 255)",
        "abbr": "NH Privacy Act",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "New Hampshire",
        "status": "in_force",
        "year": 2025,
        "url": "https://www.gencourt.state.nh.us/legislation/2024/SB0255.html",
        "notes": "Virginia model. 60-day cure period.",
        "threshold": "35K+ consumers OR 10K+ with 25%+ revenue from PI sales",
        "sensitive_data": True,
    },
    {
        "name": "New Jersey Data Privacy Act",
        "abbr": "NJDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "New Jersey",
        "status": "in_force",
        "year": 2025,
        "url": "https://pub.njleg.state.nj.us/Bills/2022/PL23/266_.PDF",
        "fallback_url": "https://www.njleg.state.nj.us/bill-search/2022/SB332",
        "fetch_method": "pdf",
        "notes": "GPC required. 30-day cure period.",
        "threshold": "100K+ consumers OR 25K+ with 25%+ revenue from PI sales",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "Tennessee Information Protection Act",
        "abbr": "TIPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Tennessee",
        "status": "in_force",
        "year": 2025,
        "url": "https://publications.tnsosfiles.com/acts/113/pub/pc0375.pdf",
        "fallback_url": "https://wapp.capitol.tn.gov/apps/BillInfo/Default.aspx?BillNumber=HB1181&GA=113",
        "fetch_method": "pdf",
        "notes": "Unique affirmative defense for bona fide privacy programs.",
        "threshold": "175K+ consumers OR 25K+ with 25%+ revenue from PI sales",
        "sensitive_data": True,
    },
    {
        "name": "Minnesota Consumer Data Privacy Act",
        "abbr": "MN MCDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Minnesota",
        "status": "in_force",
        "year": 2025,
        "url": "https://www.revisor.mn.gov/statutes/cite/325M/full",
        "fallback_url": "https://www.revisor.mn.gov/statutes/2024/cite/325M.10/pdf",
        "fallback_method": "pdf",
        "notes": "GPC required. Strict data minimization.",
        "threshold": "100K+ consumers OR 25K+ with 25%+ revenue from PI sales",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "Maryland Online Data Privacy Act",
        "abbr": "MODPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Maryland",
        "status": "in_force",
        "year": 2025,
        "url": "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcm&section=14-4601&enactments=false",
        "notes": "Strictest data minimization in US. No cure period.",
        "threshold": "35K+ consumers OR 10K+ with 20%+ revenue from PI sales",
        "sensitive_data": True,
        "gpc_required": True,
    },
    {
        "name": "Indiana Consumer Data Protection Act",
        "abbr": "INCDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Indiana",
        "status": "in_force",
        "year": 2026,
        "url": "https://www.billtrack50.com/BillDetail/1782341",
        "fallback_url": "https://iga.in.gov/laws/2023/ic/titles/024",
        "notes": "Indiana HEA 1003 — Virginia model. Excludes employee and B2B data.",
        "threshold": "100K+ consumers OR 25K+ with 50%+ revenue from PI sales",
        "sensitive_data": True,
    },
    {
        "name": "Kentucky Consumer Data Protection Act",
        "abbr": "KCDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Kentucky",
        "status": "in_force",
        "year": 2026,
        "url": "https://apps.legislature.ky.gov/recorddocuments/bill/24RS/hb15/orig_bill.pdf",
        "fallback_url": "https://apps.legislature.ky.gov/recorddocuments/bill/23RS/hb15/orig_bill.pdf",
        "fetch_method": "pdf",
        "fallback_method": "pdf",
        "notes": "Virginia model. AG enforcement only.",
        "threshold": "100K+ consumers OR 25K+ with 50%+ revenue from PI sales",
        "sensitive_data": True,
    },
    {
        "name": "Rhode Island Data Transparency and Privacy Protection Act",
        "abbr": "RIDTPPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Rhode Island",
        "status": "in_force",
        "year": 2026,
        "url": "https://rilegislature.gov/statutes/TITLE6A/6A-51/INDEX.HTM",
        "fallback_url": "https://webserver.rilegislature.gov/BillText/BillText24/HouseText24/H7787A.pdf",
        "fallback_method": "pdf",
        "notes": "Low threshold. 60-day cure period.",
        "threshold": "35K+ consumers OR 10K+ with 20%+ revenue from PI sales",
        "sensitive_data": True,
    },
    {
        "name": "Oklahoma Consumer Data Privacy Act (SB 546)",
        "abbr": "OCDPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Oklahoma",
        "status": "in_force",
        "year": 2026,
        "url": "https://www.oscn.net/applications/oscn/DeliverDocument.asp?CiteID=505071",
        "notes": "20th US state. Signed Mar 2026. Virginia VCDPA model.",
        "threshold": "100K+ consumers OR 25K+ with 50%+ revenue from PI sales",
    },
    {
        "name": "Arkansas Data Privacy and Protection Act",
        "abbr": "AR ADPPA",
        "domain": "privacy",
        "subdomain": "comprehensive",
        "jurisdiction": "US State",
        "state": "Arkansas",
        "status": "in_force",
        "year": 2026,
        "url": "https://www.arkleg.state.ar.us/assembly/2023/2023R/Acts/611.pdf",
        "fetch_method": "pdf",
        "notes": "Effective Jul 2026. Tightened minor protections.",
        "threshold": "100K+ consumers OR 25K+ with revenue from PI sales",
    },
    {
        "name": "Illinois Biometric Information Privacy Act",
        "abbr": "BIPA",
        "domain": "privacy",
        "subdomain": "biometric",
        "jurisdiction": "US State",
        "state": "Illinois",
        "status": "in_force",
        "year": 2008,
        "url": "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004&ChapterID=57",
        "notes": "Private right of action. Most-litigated US privacy law.",
    },
    {
        "name": "Washington My Health MY Data Act",
        "abbr": "WA MHMD",
        "domain": "privacy",
        "subdomain": "health",
        "jurisdiction": "US State",
        "state": "Washington",
        "status": "in_force",
        "year": 2024,
        "url": "https://app.leg.wa.gov/rcw/default.aspx?cite=19.373",
        "notes": "Broadest US health data law. Private right of action.",
    },
    {
        "name": "NYC Commercial Establishments Biometric Surveillance Ordinance",
        "abbr": "NYC Biometric",
        "domain": "privacy",
        "subdomain": "biometric",
        "jurisdiction": "US Local",
        "state": "New York",
        "city": "New York City",
        "status": "in_force",
        "year": 2021,
        "url": "https://intro.nyc/local-laws/2021-3",
        "fallback_url": "https://www.mofo.com/resources/insights/210623-biometric-identifier-information-law",
        "notes": "NYC Local Law 3 of 2021 — $500/violation private right of action. Commercial establishments.",
    },
    {
        "name": "NYC Local Law 144 — Automated Employment Decisions Tool",
        "abbr": "NYC LL144",
        "domain": "ai",
        "subdomain": "employment",
        "jurisdiction": "US Local",
        "state": "New York",
        "city": "New York City",
        "status": "in_force",
        "year": 2023,
        "url": "https://legistar.council.nyc.gov/LegislationDetail.aspx?ID=4344524&GUID=B051915D-A9AC-451E-81F8-6596032FA3F9",
        "fallback_url": "https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page",
        "notes": "Mandatory annual bias audits for AI hiring tools.",
    },
    {
        "name": "Colorado AI Act (CAIA) — Automated Decisioning Tech",
        "abbr": "CAIA",
        "domain": "ai",
        "subdomain": "high_risk_ai",
        "jurisdiction": "US State",
        "state": "Colorado",
        "status": "in_force",
        "year": 2026,
        "url": "https://leg.colorado.gov/bills/sb24-205",
        "notes": "In force Feb 2026. High-risk AI in employment, education, finance, healthcare.",
    },
    {
        "name": "Nevada Consumer Health Data Privacy Law (SB 370)",
        "abbr": "NV Health Data",
        "domain": "privacy",
        "subdomain": "health",
        "jurisdiction": "US State",
        "state": "Nevada",
        "status": "in_force",
        "year": 2023,
        "url": "https://www.leg.state.nv.us/NRS/NRS-603C.html",
        "fallback_url": "https://www.leg.state.nv.us/Session/82nd2023/Bills/SB/SB370_EN.pdf",
        "fallback_method": "pdf",
        "notes": "Private right of action. Consent required for health data.",
    },
    {
        "name": "New York Health Information Privacy Act (Advancing)",
        "abbr": "NY HIPA",
        "domain": "privacy",
        "subdomain": "health",
        "jurisdiction": "US State",
        "state": "New York",
        "status": "advancing",
        "year": 2026,
        "url": "https://nyassembly.gov/leg/?default_fld=&leg_video=&bn=S929&term=2025&Summary=Y&Text=Y",
        "fallback_url": "https://legislation.nysenate.gov/pdf/bills/2025/S929",
        "fallback_method": "pdf",
        "notes": "Would be strictest US health data law. Active 2026 legislature.",
    },
    {
        "name": "Maryland Age-Appropriate Design Code",
        "abbr": "MD AADC",
        "domain": "privacy",
        "subdomain": "children",
        "jurisdiction": "US State",
        "state": "Maryland",
        "status": "in_force",
        "year": 2024,
        "url": "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcm&section=14-4501",
        "notes": "Mirrors UK Children's Code. Under-18 protections.",
    },
]

def get_corpus() -> tuple[list[dict], list[dict]]:
    supplement = build_pdf_supplement(HAND_CORPUS)
    return HAND_CORPUS, supplement


HAND_CORPUS_REF, PDF_SUPPLEMENT = get_corpus()
CORPUS = HAND_CORPUS_REF + PDF_SUPPLEMENT


def chunk_text(text: str) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, current_words = [], []
    for para in paragraphs:
        words = para.split()
        if len(current_words) + len(words) > CHUNK_SIZE:
            if current_words:
                chunks.append(" ".join(current_words))
            current_words = current_words[-CHUNK_OVERLAP:] + words
        else:
            current_words.extend(words)
    if current_words:
        chunks.append(" ".join(current_words))
    return [c for c in chunks if len(c.strip()) > 100]


def make_chunk_id(abbr: str, idx: int, text: str) -> str:
    h = hashlib.md5(f"{abbr}_{idx}_{text[:50]}".encode()).hexdigest()[:8]
    return f"{abbr.lower().replace('/', '_').replace(' ', '_')}_{idx:04d}_{h}"


def main():
    parser = argparse.ArgumentParser(description="Norvar US privacy corpus ingestion v2")
    parser.add_argument(
        "--abbr",
        nargs="+",
        help="Ingest only these regulation abbreviations (e.g. --abbr CCPA/CPRA BIPA)",
    )
    parser.add_argument(
        "--pdf-only",
        action="store_true",
        help="Ingest only PDF supplement entries (granular URLs from corpus PDF)",
    )
    args = parser.parse_args()

    print("\n" + "=" * 68)
    print("  NORVAR — US Privacy Corpus Ingestion Pipeline v2")
    print("=" * 68 + "\n")

    with open("SETUP_SUPABASE.sql", "w") as f:
        f.write(SUPABASE_SQL)
    print("SETUP_SUPABASE.sql saved (v2 schema).\n")

    if "YOUR_" in SUPABASE_URL or "YOUR_" in SUPABASE_KEY or "YOUR_" in VOYAGE_API_KEY:
        print("Fill in API keys in .env, then re-run.\n")
        return

    print("Connecting...")
    sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    voyage = voyageai.Client(api_key=VOYAGE_API_KEY)

    try:
        sb.table(TABLE_NAME).select("chunk_text").limit(1).execute()
    except Exception as exc:
        if "chunk_text" in str(exc) or "PGRST204" in str(exc):
            print(
                "ERROR: v2 schema not applied. Run SETUP_SUPABASE.sql in Supabase SQL Editor first.\n"
                "       (This drops v1 regulatory_sources/regulatory_chunks and recreates the v2 table.)\n"
            )
            return
        raise
    version = datetime.now().strftime("%Y%m%d")
    failed = []
    total_chunks, total_regs = 0, 0

    corpus = CORPUS
    if args.pdf_only:
        corpus = PDF_SUPPLEMENT
    elif args.abbr:
        wanted = set(args.abbr)
        corpus = [r for r in CORPUS if r["abbr"] in wanted]
        missing = wanted - {r["abbr"] for r in corpus}
        if missing:
            print(f"Unknown abbreviations: {', '.join(sorted(missing))}")
        if not corpus:
            return

    print(
        f"Corpus: {len(HAND_CORPUS)} hand-curated + {len(PDF_SUPPLEMENT)} PDF supplement "
        f"= {len(CORPUS)} total"
    )
    print(f"Starting ingestion of {len(corpus)} regulations...\n")
    print("-" * 68)

    for reg in corpus:
        abbr = reg["abbr"]
        name = reg["name"]
        print(f"\n▶  {abbr}")
        print(f"   {name}")

        text, used_url = fetch_with_fallback(reg)
        if not text:
            print("   FAILED — adding to manual download list")
            failed.append(
                {
                    "abbr": abbr,
                    "name": name,
                    "url": reg["url"],
                    "fallback": reg.get("fallback_url", "none"),
                }
            )
            continue

        print(f"   OK {len(text):,} chars from {used_url[:60]}...")
        chunks = chunk_text(text)
        print(f"   {len(chunks)} chunks — embedding and storing...")

        sb.table(TABLE_NAME).delete().eq("reg_abbr", abbr).execute()

        stored = 0
        for i, chunk in enumerate(chunks):
            try:
                emb = voyage.embed(
                    [chunk],
                    model=VOYAGE_MODEL,
                    input_type="document",
                    output_dimension=EMBEDDING_DIM,
                ).embeddings[0]

                sb.table(TABLE_NAME).upsert(
                    {
                        "id": make_chunk_id(abbr, i, chunk),
                        "reg_name": name,
                        "reg_abbr": abbr,
                        "domain": reg.get("domain", "privacy"),
                        "subdomain": reg.get("subdomain"),
                        "jurisdiction": reg.get("jurisdiction", "US"),
                        "state": reg.get("state"),
                        "city": reg.get("city"),
                        "status": reg.get("status", "in_force"),
                        "year": reg.get("year"),
                        "chunk_index": i,
                        "chunk_text": chunk,
                        "embedding": emb,
                        "source_url": used_url,
                        "threshold": reg.get("threshold"),
                        "sensitive_data": reg.get("sensitive_data", False),
                        "gpc_required": reg.get("gpc_required", False),
                        "notes": reg.get("notes"),
                        "corpus_version": version,
                    }
                ).execute()

                stored += 1
                if stored % 20 == 0:
                    print(f"   ...{stored}/{len(chunks)}", flush=True)
                time.sleep(EMBED_DELAY)
            except Exception as e:
                print(f"   chunk {i} error: {e}")

        print(f"   stored {stored}/{len(chunks)} chunks")
        total_chunks += stored
        total_regs += 1

    print("\n" + "=" * 68)
    print(f"  DONE — {total_regs}/{len(corpus)} regulations | {total_chunks:,} chunks | v{version}")
    print("=" * 68)

    if failed:
        print(f"\n{len(failed)} still need manual download:")
        for item in failed:
            print(f"   • {item['abbr']}: {item['url']}")
        with open("failed_ingestions.json", "w") as fh:
            json.dump(failed, fh, indent=2)
        print("\n   List saved to failed_ingestions.json")
    else:
        print("\nAll regulations ingested.")

    print("\nRunning retrieval test...")
    try:
        q_emb = voyage.embed(
            ["What consent is required before collecting biometric data?"],
            model=VOYAGE_MODEL,
            input_type="query",
            output_dimension=EMBEDDING_DIM,
        ).embeddings[0]

        res = sb.rpc(
            "match_regulatory_chunks",
            {
                "query_embedding": q_emb,
                "match_threshold": 0.4,
                "match_count": 3,
            },
        ).execute()

        if res.data:
            print("\nQuery: 'What consent is required before collecting biometric data?'")
            print("Top results:\n")
            for r in res.data:
                print(f"  [{r['reg_abbr']}] score: {r['similarity']:.3f}")
                print(f"  {r['chunk_text'][:200]}...\n")
        else:
            print("No results — run SETUP_SUPABASE.sql in Supabase SQL Editor first.")
    except Exception as e:
        print(f"Retrieval test error: {e}")


if __name__ == "__main__":
    main()
