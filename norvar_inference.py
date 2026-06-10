#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║         NORVAR — INFERENCE ENGINE v2                                         ║
║         Governance, Risk and Compliance Intelligence Platform                ║
║                                                                              ║
║  Schema: critical/high/medium gaps, remediation per gap, redline, metrics    ║
║  Framework context injected from frameworks library                          ║
║                                                                              ║
║  Run:                                                                        ║
║    python norvar_inference.py --ask "What is biometric data?"                ║
║    python norvar_inference.py --describe "Your deployment"                   ║
║    python norvar_inference.py --describe "..." --contract "clause text..."   ║
║    python norvar_inference.py          # examples + interactive              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime
from pathlib import Path

import anthropic
import voyageai
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://YOUR_PROJECT.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "YOUR_SUPABASE_SERVICE_ROLE_KEY")
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "YOUR_VOYAGE_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "YOUR_ANTHROPIC_API_KEY")

VOYAGE_MODEL = "voyage-3-large"
EMBEDDING_DIM = 1024
CLAUDE_MODEL = "claude-sonnet-4-6"
TOP_K_CHUNKS = 12
TOP_K_ASK = 8
MAX_GAPS = 13
TABLE_NAME = "regulatory_chunks"

# ══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT (v2)
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """
You are a senior Governance, Risk and Compliance analyst specialising in
technology regulation across Privacy, AI Governance, and Cybersecurity globally.
Any technology subject (computer vision, ADMT, robotics, IoT, etc.) is assessed through these three lenses simultaneously.

Return ONLY valid JSON. No preamble, no markdown fences. Use this exact structure:

{
  "title": "short assessment title",
  "subtitle": "one-line primary risk theme",
  "score": <integer 0-100, 100 = fully compliant>,
  "risk": "high" | "med" | "low",
  "risk_summary": "one sentence on overall risk level",
  "summary": "two sentence plain English summary",
  "frameworks": ["applicable framework abbreviations"],
  "metrics": [
    { "label": "metric name", "value": "value or count" }
  ],
  "gaps": [
    {
      "severity": "critical" | "high" | "medium",
      "title": "short gap title",
      "detail": "what the requirement is and how the deployment falls short — specific, cite article numbers",
      "frameworks": ["framework abbreviations for this gap"],
      "remediation": "specific actionable fix — what to build, change or document"
    }
  ],
  "redline": {
    "before": "original clause text",
    "after": [
      { "type": "del" | "ins" | "txt", "text": "text segment" }
    ],
    "note": "why this redline is required and which regulation it addresses"
  }
}

Rules:
- Report up to """ + str(MAX_GAPS) + """ gaps maximum — the most critical only.
- severity critical = prohibited practice, active enforcement risk, or immediate liability
- severity high = significant gap requiring priority action
- severity medium = gap requiring attention, lower immediate risk
- score is compliance maturity (NOT risk level) — high risk with no controls = low score
- redline = null if no contract text provided
- cite specific articles: "GDPR Article 9(2)(a)" not just "GDPR"
- remediation must be actionable by an engineer or legal counsel
- metrics: include 3-5 stats (total gaps, critical gaps, jurisdictions, frameworks triggered, estimated remediation time)
- do not invent regulations not in the retrieved clauses or framework reference
"""

FRAMEWORKS_PATH = Path(__file__).resolve().parent / "data" / "frameworks.json"


def _load_frameworks() -> list[dict]:
    """Load framework corpus exported from src/lib/frameworks.ts."""
    with open(FRAMEWORKS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _jurisdiction_tags(jurisdiction: str) -> set[str]:
    j = jurisdiction.lower()
    tags: set[str] = set()
    if "eu" in j or "eea" in j:
        tags.add("eu")
    if "us federal" in j:
        tags.add("us_federal")
    if "us state" in j or "us local" in j:
        tags.add("us_state")
    if "canada" in j:
        tags.add("canada")
    if "uk" in j or "united kingdom" in j:
        tags.add("uk")
    return tags


def _build_domain_fw(frameworks: list[dict]) -> dict[str, list[str]]:
    domain_fw: dict[str, list[str]] = {}
    for fw in frameworks:
        domain_fw.setdefault(fw["domain"], []).append(fw["abbr"])
    return domain_fw


def _build_juris_fw(frameworks: list[dict]) -> dict[str, list[str]]:
    juris_fw: dict[str, list[str]] = {}
    for fw in frameworks:
        for tag in _jurisdiction_tags(fw["jurisdiction"]):
            juris_fw.setdefault(tag, []).append(fw["abbr"])
    # International standards apply across major jurisdictions in assessments.
    for fw in frameworks:
        if fw["jurisdiction"].lower() == "international":
            for tag in ("eu", "us_federal", "us_state", "uk", "canada"):
                bucket = juris_fw.setdefault(tag, [])
                if fw["abbr"] not in bucket:
                    bucket.append(fw["abbr"])
    return juris_fw


FRAMEWORKS: list[dict] = _load_frameworks()
FRAMEWORK_CONTROLS: dict[str, list[str]] = {f["abbr"]: f["controls"] for f in FRAMEWORKS}
DOMAIN_FW: dict[str, list[str]] = _build_domain_fw(FRAMEWORKS)
JURIS_FW: dict[str, list[str]] = _build_juris_fw(FRAMEWORKS)

SEV_ICON = {"critical": "🔴 CRITICAL", "high": "🟠 HIGH", "medium": "🟡 MEDIUM"}
RISK_ICON = {"high": "🔴", "med": "🟡", "low": "🟢"}


def get_framework(abbr: str) -> dict | None:
    """Look up a framework by abbreviation or partial name (case-insensitive)."""
    needle = abbr.lower()
    for fw in FRAMEWORKS:
        if fw["abbr"].lower() == needle or needle in fw["name"].lower():
            return fw
    return None


def build_framework_context(domains: list[str], jurisdictions: list[str]) -> str:
    """Build compact framework reference for Claude — mirrors buildFrameworkPromptContext()."""
    relevant_abbrs: set[str] = set()
    for d in domains:
        relevant_abbrs.update(DOMAIN_FW.get(d, []))
    for j in jurisdictions:
        relevant_abbrs.update(JURIS_FW.get(j, []))

    if relevant_abbrs:
        selected = [f for f in FRAMEWORKS if f["abbr"] in relevant_abbrs]
    else:
        selected = FRAMEWORKS

    blocks = ["FRAMEWORK REFERENCE (cite these precisely when identifying gaps):\n"]
    for f in sorted(selected, key=lambda x: x["abbr"]):
        blocks.append(
            f"[{f['abbr']}] {f['name']} ({f['jurisdiction']} · {f['status']})\n"
            f"Scope: {f['scope']}\n"
            f"Key controls: {', '.join(f['controls'][:6])}\n"
            f"Enforcement: {f['enforcement']}"
        )
    return "\n\n".join(blocks)

# ══════════════════════════════════════════════════════════════════════════════
# RISK SCORING ENGINE
# ══════════════════════════════════════════════════════════════════════════════

# Three core domain lenses. CV, ADMT, and Robotics are assessment subjects
# evaluated through Privacy, AI Governance, and Cybersecurity — not separate domains.
DOMAIN_SCORES = {
    "privacy": 36,
    "ai": 34,
    "cyber": 30,
}

JURISDICTION_SCORES = {
    "eu": 22,
    "us_state": 16,
    "uk": 14,
    "us_federal": 12,
    "apac": 10,
    "latam": 8,
    "mena": 8,
}

DEPLOYMENT_SCORES = {
    "facial_recognition": 25,
    "law_enforcement": 25,
    "workplace_surveillance": 22,
    "healthcare_ai": 20,
    "hiring_ai": 18,
    "credit_scoring": 18,
    "autonomous_systems": 18,
    "consumer_profiling": 14,
    "content_moderation": 12,
    "iot_connected": 12,
}

DATA_TYPE_SCORES = {
    "biometric": 25,
    "health": 24,
    "neural": 22,
    "children": 20,
    "location": 16,
    "financial": 15,
    "communications": 12,
    "behavioural": 10,
    "general_pi": 5,
}

SECTOR_SCORES = {
    "government": 20,
    "healthcare": 18,
    "finance": 16,
    "hr_recruitment": 14,
    "education": 14,
    "transport": 12,
    "media_adtech": 12,
    "legal": 12,
    "retail": 8,
    "proptech": 8,
}

WEIGHTS = {
    "data_types": 0.24,
    "deployment": 0.22,
    "domains": 0.20,
    "jurisdictions": 0.20,
    "sector": 0.14,
}

EXTRACT_INPUTS_PROMPT = """
You extract a structured deployment risk profile from a plain English description.
Return ONLY valid JSON. No preamble, no markdown code blocks.

Use ONLY these allowed values (pick all that clearly apply):

domains: privacy, ai, cyber
  (cv, admt, and robotics are subjects — map them to the domain lenses above)
jurisdictions: eu, uk, us_federal, us_state, apac, latam, mena
deployments: facial_recognition, law_enforcement, workplace_surveillance,
  healthcare_ai, hiring_ai, credit_scoring, autonomous_systems, consumer_profiling,
  content_moderation, iot_connected
data_types: biometric, health, neural, children, location, financial,
  communications, behavioural, general_pi
sector (single value): government, healthcare, finance, hr_recruitment, education,
  transport, media_adtech, legal, retail, proptech

Infer from geography (e.g. California/Texas → us_state; EU → eu; UK → uk).
Infer sector from context (retail stores → retail). Default sector to retail if unclear.
Include at least one domain, jurisdiction, deployment, and data_type when inferable.

{
  "domains": ["..."],
  "jurisdictions": ["..."],
  "deployments": ["..."],
  "data_types": ["..."],
  "sector": "..."
}
"""


def sanitize_risk_inputs(raw: dict) -> dict:
    """Filter inferred values to allowed scoring keys; apply safe defaults."""
    domains = [d.lower() for d in raw.get("domains", []) if d.lower() in DOMAIN_SCORES]
    jurisdictions = [j.lower() for j in raw.get("jurisdictions", []) if j.lower() in JURISDICTION_SCORES]
    deployments = [d.lower() for d in raw.get("deployments", []) if d.lower() in DEPLOYMENT_SCORES]
    data_types = [d.lower() for d in raw.get("data_types", []) if d.lower() in DATA_TYPE_SCORES]
    sector = (raw.get("sector") or "").lower()
    if sector not in SECTOR_SCORES:
        sector = ""

    return {
        "domains": domains,
        "jurisdictions": jurisdictions,
        "deployments": deployments,
        "data_types": data_types,
        "sector": sector,
    }


def infer_risk_inputs_heuristic(description: str) -> dict:
    """Keyword-based fallback when Claude extraction is unavailable."""
    t = description.lower()

    # Three core domain lenses.
    # CV, ADMT, and Robotics signals map into these domains — they are subjects, not domains.
    domains: list[str] = []

    # Privacy lens: triggered by data handling signals AND by CV/biometric/robotics subjects
    if any(k in t for k in (
        "privacy", "personal data", "consent", "gdpr", "ccpa",
        "biometric", "facial", "camera", "vision", "surveillance",  # CV subjects
        "robot", "robotics", "autonomous vehicle", "drone",            # Robotics subjects
        "location", "health", "children", "employee",
    )):
        domains.append("privacy")

    # AI Governance lens: triggered by AI/ML signals AND by ADMT/CV/Robotics subjects
    if any(k in t for k in (
        "ai", "machine learning", " ml", "model", "algorithm",
        "automated", "decision", "scoring", "profiling", "hiring", "credit",  # ADMT subjects
        "computer vision", "video", "facial recognition",                          # CV subjects
        "autonomous", "robot", "drone",                                            # Robotics subjects
    )):
        domains.append("ai")

    # Cybersecurity lens: triggered by security signals AND by IoT/CV/Robotics attack surface
    if any(k in t for k in (
        "cyber", "security", "breach", "encryption", "iot",
        "camera", "sensor", "network", "firmware",                              # CV/Robotics attack surface
        "robot", "autonomous vehicle", "connected", "embedded",                 # Robotics subjects
    )):
        domains.append("cyber")

    if not domains:
        domains = ["privacy"]

    jurisdictions: list[str] = []
    if any(k in t for k in ("eu ", "europe", "european union", "gdpr")):
        jurisdictions.append("eu")
    if any(k in t for k in ("uk", "united kingdom", "britain")):
        jurisdictions.append("uk")
    if any(k in t for k in ("federal", "hipaa", "fcra", "coppa", "ferpa", "all 50 states")):
        jurisdictions.append("us_federal")
    us_states = (
        "california", "texas", "new york", "virginia", "colorado", "florida",
        "illinois", "washington", "oregon", "state law", "us state",
    )
    if any(k in t for k in us_states):
        jurisdictions.append("us_state")
    if any(k in t for k in ("apac", "asia", "australia", "japan", "singapore", "china")):
        jurisdictions.append("apac")
    if any(k in t for k in ("latam", "latin america", "brazil", "mexico")):
        jurisdictions.append("latam")
    if any(k in t for k in ("mena", "middle east", "saudi", "uae")):
        jurisdictions.append("mena")
    if not jurisdictions:
        jurisdictions = ["us_state"]

    deployments: list[str] = []
    if any(k in t for k in ("facial", "face recognition", "biometric face")):
        deployments.append("facial_recognition")
    if any(k in t for k in ("law enforcement", "police")):
        deployments.append("law_enforcement")
    if any(k in t for k in ("workplace", "employee monitoring", "office surveillance")):
        deployments.append("workplace_surveillance")
    if any(k in t for k in ("healthcare", "clinical", "patient", "diagnosis")):
        deployments.append("healthcare_ai")
    if any(k in t for k in ("hiring", "recruitment", "interview", "candidate")):
        deployments.append("hiring_ai")
    if any(k in t for k in ("credit", "loan", "lending", "underwriting")):
        deployments.append("credit_scoring")
    if any(k in t for k in ("autonomous", "self-driving", "robot navigation")):
        deployments.append("autonomous_systems")
    if any(k in t for k in ("profiling", "analytics", "tracking", "dwell", "movement", "customer behavior")):
        deployments.append("consumer_profiling")
    if any(k in t for k in ("moderation", "content filter")):
        deployments.append("content_moderation")
    if any(k in t for k in ("iot", "connected device", "sensor", "camera network")):
        deployments.append("iot_connected")
    if not deployments:
        deployments = ["consumer_profiling"]

    data_types: list[str] = []
    if any(k in t for k in ("biometric", "fingerprint", "faceprint", "voiceprint")):
        data_types.append("biometric")
    if any(k in t for k in ("health", "medical", "phi", "diagnosis")):
        data_types.append("health")
    if any(k in t for k in ("neural", "brain signal", "eeg")):
        data_types.append("neural")
    if any(k in t for k in ("children", "minor", "under 13", "under 18", "kids")):
        data_types.append("children")
    if any(k in t for k in ("location", "gps", "geolocation", "movement", "dwell")):
        data_types.append("location")
    if any(k in t for k in ("financial", "payment", "bank", "credit history")):
        data_types.append("financial")
    if any(k in t for k in ("communication", "message", "email", "chat")):
        data_types.append("communications")
    if any(k in t for k in ("behavioural", "behavioral", "analytics", "profiling", "dwell")):
        data_types.append("behavioural")
    if not data_types:
        data_types = ["general_pi"]

    sector = ""
    sector_map = {
        "government": ("government", "public sector", "agency"),
        "healthcare": ("healthcare", "hospital", "clinical", "patient"),
        "finance": ("fintech", "finance", "bank", "lending", "insurance"),
        "hr_recruitment": ("hiring", "recruitment", "hr ", "talent"),
        "education": ("education", "school", "university", "student"),
        "transport": ("transport", "logistics", "fleet", "automotive"),
        "media_adtech": ("adtech", "advertising", "media", "publisher"),
        "legal": ("legal", "law firm"),
        "retail": ("retail", "store", "shop", "supermarket", "mall"),
        "proptech": ("proptech", "real estate", "property"),
    }
    for key, phrases in sector_map.items():
        if any(p in t for p in phrases):
            sector = key
            break
    if not sector:
        sector = "retail"

    return sanitize_risk_inputs(
        {
            "domains": domains,
            "jurisdictions": jurisdictions,
            "deployments": deployments,
            "data_types": data_types,
            "sector": sector,
        }
    )


def parse_json_from_claude(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def infer_risk_inputs_from_description(
    description: str,
    claude: anthropic.Anthropic,
) -> dict:
    """Infer deployment profile from natural language (Claude + heuristic fallback)."""
    try:
        response = claude.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=512,
            system=EXTRACT_INPUTS_PROMPT,
            messages=[{"role": "user", "content": description}],
        )
        raw = parse_json_from_claude(response.content[0].text)
        inferred = sanitize_risk_inputs(raw)
        if inferred["domains"] and inferred["jurisdictions"] and inferred["data_types"] and inferred["sector"]:
            inferred["inference_source"] = "claude"
            return inferred
    except (json.JSONDecodeError, anthropic.AnthropicError, IndexError, KeyError):
        pass

    inferred = infer_risk_inputs_heuristic(description)
    inferred["inference_source"] = "heuristic"
    return inferred


def print_inferred_inputs(inputs: dict) -> None:
    source = inputs.get("inference_source", "unknown")
    print(f"\n  Inferred deployment profile ({source}):")
    print(f"    domains:       {', '.join(inputs.get('domains', []))}")
    print(f"    jurisdictions: {', '.join(inputs.get('jurisdictions', []))}")
    print(f"    deployments:   {', '.join(inputs.get('deployments', []))}")
    print(f"    data_types:    {', '.join(inputs.get('data_types', []))}")
    print(f"    sector:        {inputs.get('sector', '')}")


def slugify_description(text: str, max_len: int = 36) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return slug[:max_len] or "deployment"


def save_assessment(assessment: dict, prefix: str) -> str:
    filename = f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(filename, "w") as f:
        json.dump(assessment, f, indent=2)
    return filename


def close_partial_json(text: str) -> str:
    stack: list[str] = []
    in_str = False
    esc = False
    for c in text:
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            stack.append("}")
        elif c == "[":
            stack.append("]")
        elif c in "}]" and stack and stack[-1] == c:
            stack.pop()
    return text + ('"' if in_str else "") + "".join(reversed(stack))


def parse_assessment_json(text: str) -> dict:
    cleaned = re.sub(r"```json\s*", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"```", "", cleaned).strip()
    start = cleaned.find("{")
    if start == -1:
        raise ValueError("No JSON found")
    try:
        return json.loads(cleaned[start:])
    except json.JSONDecodeError:
        return json.loads(close_partial_json(cleaned[start:]))


def norm_sev(value: str) -> str:
    v = value.lower()
    if any(w in v for w in ("critical", "urgent")):
        return "critical"
    if any(w in v for w in ("high", "severe")):
        return "high"
    return "medium"


def norm_risk(value: str, score: int) -> str:
    v = value.lower()
    if any(w in v for w in ("high", "critical")):
        return "high"
    if any(w in v for w in ("med", "moderate")):
        return "med"
    if "low" in v:
        return "low"
    return "high" if score < 40 else "med" if score < 70 else "low"


def calculate_risk_score(
    domains: list[str],
    jurisdictions: list[str],
    deployments: list[str],
    data_types: list[str],
    sector: str,
) -> dict:
    """Calculate external risk exposure score 0-100 across five dimensions."""

    def sum_scores(items: list[str], table: dict) -> int:
        return min(sum(table.get(item.lower(), 0) for item in items), 100)

    sub_scores = {
        "data_types": sum_scores(data_types, DATA_TYPE_SCORES),
        "deployment": sum_scores(deployments, DEPLOYMENT_SCORES),
        "domains": sum_scores(domains, DOMAIN_SCORES),
        "jurisdictions": sum_scores(jurisdictions, JURISDICTION_SCORES),
        "sector": sum_scores([sector], SECTOR_SCORES),
    }

    composite = round(
        sub_scores["data_types"] * WEIGHTS["data_types"]
        + sub_scores["deployment"] * WEIGHTS["deployment"]
        + sub_scores["domains"] * WEIGHTS["domains"]
        + sub_scores["jurisdictions"] * WEIGHTS["jurisdictions"]
        + sub_scores["sector"] * WEIGHTS["sector"]
    )

    tier = "High" if composite >= 70 else "Medium" if composite >= 40 else "Low"

    return {"composite": composite, "tier": tier, "sub_scores": sub_scores}


def calculate_risk_score_from_inputs(inputs: dict) -> dict:
    return calculate_risk_score(
        domains=inputs.get("domains", []),
        jurisdictions=inputs.get("jurisdictions", []),
        deployments=inputs.get("deployments", []),
        data_types=inputs.get("data_types", []),
        sector=inputs.get("sector", ""),
    )


# ══════════════════════════════════════════════════════════════════════════════
# RETRIEVAL
# ══════════════════════════════════════════════════════════════════════════════

def retrieve_relevant_chunks(
    query: str,
    voyage: voyageai.Client,
    sb: Client,
    domains: list[str] | None = None,
    top_k: int = TOP_K_CHUNKS,
) -> list[dict]:
    """Convert query to embedding, search Supabase for most relevant chunks."""
    embedding = voyage.embed(
        [query],
        model=VOYAGE_MODEL,
        input_type="query",
        output_dimension=EMBEDDING_DIM,
    ).embeddings[0]

    params = {
        "query_embedding": embedding,
        "match_threshold": 0.35,
        "match_count": top_k,
    }

    if domains and len(domains) == 1:
        params["filter_domain"] = domains[0]

    result = sb.rpc("match_regulatory_chunks", params).execute()
    return result.data or []


def format_chunks_for_claude(chunks: list[dict]) -> str:
    """Format retrieved chunks into a clear string Claude can reason over."""
    if not chunks:
        return "No specific clauses retrieved — use framework reference above."

    lines = ["RETRIEVED REGULATORY CLAUSES:\n"]
    for i, chunk in enumerate(chunks, 1):
        state = f" ({chunk['state']})" if chunk.get("state") else ""
        lines.append(f"[{i}] {chunk['reg_abbr']} — {chunk['reg_name']}")
        lines.append(f"    Jurisdiction: {chunk['jurisdiction']}{state}")
        lines.append(f"    Relevance: {chunk['similarity']:.3f}")
        lines.append(f"    Text: {chunk['chunk_text']}\n")

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# CORPUS Q&A (--ask)
# ══════════════════════════════════════════════════════════════════════════════

ASK_SYSTEM_PROMPT = """
You answer questions about US privacy and technology regulation using ONLY the
regulatory clauses retrieved from the compliance corpus provided in the user message.

RULES:
- Answer in clear plain English. Use 2-4 short paragraphs for definitional questions.
- Every legal claim must cite the source as [abbr] plus article, section, or rule
  number when available (e.g. [BIPA 740 ILCS 14/10]).
- When multiple jurisdictions define a term differently, explain the differences.
- Do NOT cite or mention regulations not present in the retrieved clauses.
- If the retrieved clauses do not contain enough information, say what is missing.
- End with a "Sources" section listing each [abbr] you cited and its full regulation name.

Write the answer directly. Do not use JSON or markdown code blocks.
"""


def run_ask(
    question: str,
    voyage: voyageai.Client,
    sb: Client,
    claude: anthropic.Anthropic,
    top_k: int = TOP_K_ASK,
) -> dict:
    """Retrieve corpus clauses and answer a regulatory question with citations."""
    print(f"\nQuestion: {question}\n")
    print("Retrieving relevant regulatory clauses...")

    chunks = retrieve_relevant_chunks(question, voyage, sb, top_k=top_k)
    print(f"  Retrieved {len(chunks)} chunks")
    if chunks:
        print(f"  Top match: [{chunks[0]['reg_abbr']}] — similarity {chunks[0]['similarity']:.3f}")

    formatted_chunks = format_chunks_for_claude(chunks)

    print("Generating answer...\n")

    user_message = f"""
QUESTION:
{question}

{formatted_chunks}

Answer the question using only the retrieved clauses above.
"""

    response = claude.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        system=ASK_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    answer = response.content[0].text.strip()

    sources = [
        {
            "index": i,
            "reg_abbr": c["reg_abbr"],
            "reg_name": c["reg_name"],
            "jurisdiction": c["jurisdiction"],
            "state": c.get("state"),
            "similarity": c["similarity"],
            "source_url": c.get("source_url"),
        }
        for i, c in enumerate(chunks, 1)
    ]

    return {
        "question": question,
        "answer": answer,
        "sources": sources,
        "chunks": chunks,
        "meta": {
            "answered_at": datetime.now().isoformat(),
            "chunks_retrieved": len(chunks),
            "claude_model": CLAUDE_MODEL,
            "voyage_model": VOYAGE_MODEL,
        },
    }


def print_ask_result(result: dict) -> None:
    print("=" * 60)
    print("  NORVAR ANSWER")
    print("=" * 60)
    print()
    print(result.get("answer", ""))
    print()
    print("=" * 60)


# ══════════════════════════════════════════════════════════════════════════════
# INFERENCE
# ══════════════════════════════════════════════════════════════════════════════

def validate_gaps_v2(assessment: dict) -> list[str]:
    """Return warnings when gaps exceed MAX_GAPS or lack remediation."""
    warnings: list[str] = []
    gaps = assessment.get("gaps", [])
    if len(gaps) > MAX_GAPS:
        warnings.append(f"Returned {len(gaps)} gaps (max {MAX_GAPS})")
    missing = [
        g.get("title", f"gap #{i + 1}")
        for i, g in enumerate(gaps)
        if not g.get("remediation")
    ]
    if missing:
        warnings.append(f"Gaps missing remediation: {', '.join(missing)}")
    return warnings


def normalize_assessment_v2(assessment: dict) -> dict:
    if "score" in assessment:
        try:
            assessment["score"] = max(0, min(100, round(float(assessment["score"]))))
        except (TypeError, ValueError):
            assessment["score"] = 50
    if "risk" in assessment and "score" in assessment:
        assessment["risk"] = norm_risk(str(assessment["risk"]), assessment["score"])
    for gap in assessment.get("gaps", []):
        if "severity" in gap:
            gap["severity"] = norm_sev(str(gap["severity"]))
        if not gap.get("remediation"):
            gap["remediation"] = gap.get("detail", "No remediation specified.")
    return assessment


def run_assessment(
    deployment_description: str,
    risk_inputs: dict,
    voyage: voyageai.Client,
    sb: Client,
    claude: anthropic.Anthropic,
    contract_text: str | None = None,
) -> dict:
    """Full assessment pipeline v2: score, retrieve, framework context, Claude analysis."""

    print("\n" + "=" * 60)
    print("  NORVAR ASSESSMENT v2")
    print("=" * 60)
    print(f"\nDeployment: {deployment_description[:120]}...")

    print("\nStep 1: Risk scoring...")
    score_result = calculate_risk_score_from_inputs(risk_inputs)
    print(f"  {score_result['composite']}/100 — {score_result['tier']} risk | Sub-scores: {score_result['sub_scores']}")

    print("\nStep 2: Retrieving clauses...")
    enriched_query = (
        f"{deployment_description}. "
        f"Domains: {', '.join(risk_inputs.get('domains', []))}. "
        f"Data: {', '.join(risk_inputs.get('data_types', []))}. "
        f"Jurisdictions: {', '.join(risk_inputs.get('jurisdictions', []))}."
    )
    chunks = retrieve_relevant_chunks(
        query=enriched_query,
        voyage=voyage,
        sb=sb,
        domains=risk_inputs.get("domains"),
        top_k=TOP_K_CHUNKS,
    )
    print(
        f"  {len(chunks)} chunks"
        + (f" | Top: [{chunks[0]['reg_abbr']}] {chunks[0]['similarity']:.3f}" if chunks else "")
    )

    fw_ctx = build_framework_context(
        risk_inputs.get("domains", []),
        risk_inputs.get("jurisdictions", []),
    )

    print("\nStep 3: Claude analysis...")
    contract_block = f"\nCONTRACT TEXT FOR REDLINING:\n{contract_text}" if contract_text else ""
    user_message = f"""DEPLOYMENT DESCRIPTION:
{deployment_description}

DEPLOYMENT PROFILE:
- Domains: {', '.join(risk_inputs.get('domains', [])) or 'not specified'}
- Jurisdictions: {', '.join(risk_inputs.get('jurisdictions', [])) or 'not specified'}
- Deployment types: {', '.join(risk_inputs.get('deployments', [])) or 'not specified'}
- Data types: {', '.join(risk_inputs.get('data_types', [])) or 'not specified'}
- Sector: {risk_inputs.get('sector', '') or 'not specified'}
- External risk exposure score: {score_result['composite']}/100 ({score_result['tier']}) — use as reference context

{fw_ctx}

{format_chunks_for_claude(chunks)}
{contract_block}

Return your compliance assessment as JSON."""

    response = claude.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=5000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    raw_output = response.content[0].text.strip()

    print("\nStep 4: Parsing...")
    try:
        assessment = parse_assessment_json(raw_output)
        assessment = normalize_assessment_v2(assessment)
        for warning in validate_gaps_v2(assessment):
            print(f"  Warning: {warning}")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  Warning: {e}")
        assessment = {"raw_output": raw_output, "parse_error": str(e)}

    assessment["risk_score"] = score_result
    assessment["meta"] = {
        "assessed_at": datetime.now().isoformat(),
        "chunks_retrieved": len(chunks),
        "corpus_version": chunks[0].get("corpus_version", "unknown") if chunks else "unknown",
        "claude_model": CLAUDE_MODEL,
        "voyage_model": VOYAGE_MODEL,
        "engine_version": "v2",
    }
    if risk_inputs.get("inference_source"):
        assessment["meta"]["inferred_inputs"] = {
            k: risk_inputs[k]
            for k in ("domains", "jurisdictions", "deployments", "data_types", "sector", "inference_source")
            if k in risk_inputs
        }
    if contract_text:
        assessment["meta"]["contract_redlined"] = True

    return assessment


# ══════════════════════════════════════════════════════════════════════════════
# OUTPUT FORMATTER
# ══════════════════════════════════════════════════════════════════════════════

def print_assessment(assessment: dict):
    print("\n" + "=" * 60)
    print("  NORVAR RESULT v2")
    print("=" * 60)

    exposure = assessment.get("risk_score", {})
    risk = assessment.get("risk", "?")
    compliance = assessment.get("score", "?")
    print(
        f"\n  {RISK_ICON.get(risk, '•')} Risk: {str(risk).upper()}  |  "
        f"Compliance score: {compliance}/100  |  "
        f"Exposure: {exposure.get('composite', '?')}/100"
    )
    print(f"\n  {assessment.get('title', '')} — {assessment.get('subtitle', '')}")
    print(f"\n  {assessment.get('summary', assessment.get('risk_summary', ''))}")

    for metric in assessment.get("metrics", []):
        print(f"    {metric.get('label', '')}: {metric.get('value', '')}")

    if exposure.get("sub_scores"):
        print("\n  Dimension scores:")
        for dim, val in exposure["sub_scores"].items():
            bar = "█" * (val // 10) + "░" * (10 - val // 10)
            print(f"    {dim:<20} {bar} {val}")

    frameworks = assessment.get("frameworks", [])
    if frameworks:
        print(f"\n  Frameworks: {', '.join(frameworks)}")

    gaps = assessment.get("gaps", [])
    if gaps:
        critical = [g for g in gaps if g.get("severity") == "critical"]
        high = [g for g in gaps if g.get("severity") == "high"]
        medium = [g for g in gaps if g.get("severity") == "medium"]
        print(
            f"\n  Gaps: {len(gaps)} total | {len(critical)} critical | "
            f"{len(high)} high | {len(medium)} medium"
        )
        for sev, items in [("critical", critical), ("high", high), ("medium", medium)]:
            for gap in items:
                fws = ", ".join(gap.get("frameworks", []))
                print(f"\n  {SEV_ICON.get(sev, sev)} [{fws}]")
                print(f"    {gap.get('title', '')}")
                detail = gap.get("detail", gap.get("description", ""))
                print(f"    Issue:  {detail[:200]}")
                print(f"    Fix:    {gap.get('remediation', '')[:200]}")

    redline = assessment.get("redline")
    if redline:
        print(f"\n  Redline note: {redline.get('note', '')}")

    print("\n" + "=" * 60)


# ══════════════════════════════════════════════════════════════════════════════
# EXAMPLE ASSESSMENTS
# ══════════════════════════════════════════════════════════════════════════════

EXAMPLE_ASSESSMENTS = [
    {
        "description": (
            "We are building an AI-powered hiring platform that uses computer vision "
            "to analyse video interviews. The system scores candidates on facial expression "
            "analysis and emotion detection. We target US companies in New York and California "
            "and are expanding to the EU in Q3. The system makes or substantially influences "
            "hiring decisions and processes biometric facial data."
        ),
        "inputs": {
            "domains": ["ai", "privacy"],  # cv and adm map to ai lens
            "jurisdictions": ["us_state", "eu"],
            "deployments": ["hiring_ai", "facial_recognition"],
            "data_types": ["biometric", "behavioural"],
            "sector": "hr_recruitment",
        },
        "contract_text": (
            "Vendor shall process Candidate Data solely for Assessment Services. "
            "Vendor may retain Candidate Data for up to 36 months following end of engagement. "
            "Vendor shall implement reasonable security measures. "
            "Sub-processors may be engaged at Vendor discretion."
        ),
    },
    {
        "description": (
            "We are building a fintech app using machine learning to make real-time credit "
            "decisions for personal loans up to $25,000. The model uses financial history, "
            "behavioural data, and third-party data broker inputs. We operate across all 50 "
            "US states and are launching in the UK next quarter. Decisions are fully automated "
            "with no human review."
        ),
        "inputs": {
            "domains": ["ai", "privacy", "cyber"],  # adm maps to ai lens
            "jurisdictions": ["us_federal", "us_state", "uk"],
            "deployments": ["credit_scoring"],
            "data_types": ["financial", "behavioural", "general_pi"],
            "sector": "finance",
        },
        "contract_text": None,
    },
]


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def check_config() -> list[str]:
    missing = []
    if "YOUR_" in SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if "YOUR_" in SUPABASE_KEY:
        missing.append("SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY")
    if "YOUR_" in VOYAGE_API_KEY:
        missing.append("VOYAGE_API_KEY")
    if "YOUR_" in ANTHROPIC_API_KEY:
        missing.append("ANTHROPIC_API_KEY")
    return missing


def connect_services() -> tuple[Client, voyageai.Client, anthropic.Anthropic]:
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    voyage = voyageai.Client(api_key=VOYAGE_API_KEY)
    claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return sb, voyage, claude


def save_ask_result(result: dict, prefix: str) -> str:
    """Save Q&A result; omit full chunk text from JSON to keep files readable."""
    export = {
        "question": result["question"],
        "answer": result["answer"],
        "sources": result["sources"],
        "meta": result["meta"],
    }
    filename = f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(filename, "w") as f:
        json.dump(export, f, indent=2)
    return filename


def run_ask_mode(
    question: str,
    sb: Client,
    voyage: voyageai.Client,
    claude: anthropic.Anthropic,
) -> None:
    result = run_ask(question, voyage, sb, claude)
    print_ask_result(result)
    prefix = f"norvar_answer_{slugify_description(question)}"
    filename = save_ask_result(result, prefix)
    print(f"\n  ✅  Answer saved to {filename}")


def run_ask_interactive(
    sb: Client,
    voyage: voyageai.Client,
    claude: anthropic.Anthropic,
) -> None:
    print("\n" + "=" * 60)
    print("  ASK MODE — regulatory Q&A from corpus")
    print("  Ask a question or type 'quit' to exit.")
    print("=" * 60)

    while True:
        print("\nQuestion:")
        question = input("> ").strip()

        if question.lower() in ["quit", "exit", "q"]:
            print("\nExiting.\n")
            break

        if not question:
            continue

        run_ask_mode(question, sb, voyage, claude)


def run_describe_mode(
    description: str,
    sb: Client,
    voyage: voyageai.Client,
    claude: anthropic.Anthropic,
    contract_text: str | None = None,
) -> None:
    print("Inferring deployment profile from description...")
    inputs = infer_risk_inputs_from_description(description, claude)
    print_inferred_inputs(inputs)

    assessment = run_assessment(
        deployment_description=description,
        risk_inputs=inputs,
        voyage=voyage,
        sb=sb,
        claude=claude,
        contract_text=contract_text,
    )
    print_assessment(assessment)

    prefix = f"norvar_v2_{slugify_description(description)}"
    filename = save_assessment(assessment, prefix)
    print(f"\n  ✅  Full assessment saved to {filename}")


def run_examples(sb: Client, voyage: voyageai.Client, claude: anthropic.Anthropic) -> None:
    print(f"Running {len(EXAMPLE_ASSESSMENTS)} example assessment(s)...\n")

    for i, example in enumerate(EXAMPLE_ASSESSMENTS, 1):
        print(f"\n{'─' * 60}")
        print(f"ASSESSMENT {i} of {len(EXAMPLE_ASSESSMENTS)}")
        print(f"{'─' * 60}")

        assessment = run_assessment(
            deployment_description=example["description"],
            risk_inputs=example["inputs"],
            voyage=voyage,
            sb=sb,
            claude=claude,
            contract_text=example.get("contract_text"),
        )
        print_assessment(assessment)
        filename = save_assessment(assessment, f"norvar_v2_{i}")
        print(f"\n  ✅  Full assessment saved to {filename}")


def run_interactive(sb: Client, voyage: voyageai.Client, claude: anthropic.Anthropic) -> None:
    print("\n" + "=" * 60)
    print("  INTERACTIVE MODE")
    print("  Describe your deployment (inputs inferred automatically).")
    print("  Type 'quit' to exit.")
    print("=" * 60)

    while True:
        print("\nDescribe your deployment (or type 'quit'):")
        description = input("> ").strip()

        if description.lower() in ["quit", "exit", "q"]:
            print("\nExiting. Assessments saved as JSON files.\n")
            break

        if not description:
            continue

        inputs = infer_risk_inputs_from_description(description, claude)
        print_inferred_inputs(inputs)

        print("Contract text to redline? (paste or Enter to skip):")
        contract = input("> ").strip() or None

        assessment = run_assessment(
            deployment_description=description,
            risk_inputs=inputs,
            voyage=voyage,
            sb=sb,
            claude=claude,
            contract_text=contract,
        )
        print_assessment(assessment)
        filename = save_assessment(assessment, "norvar_v2_custom")
        print(f"\n✅  Full assessment saved to {filename}")


def main():
    parser = argparse.ArgumentParser(
        description="Norvar regulatory compliance inference engine",
    )
    parser.add_argument(
        "--ask",
        "-a",
        nargs="?",
        const="",
        metavar="TEXT",
        help="Ask a regulatory question (corpus-backed answer with citations)",
    )
    parser.add_argument(
        "--describe",
        "-d",
        metavar="TEXT",
        help="One-sentence deployment description; infers profile and runs full assessment",
    )
    parser.add_argument(
        "--contract",
        metavar="TEXT",
        help="Contract clause text for redline analysis (use with --describe)",
    )
    parser.add_argument(
        "--examples",
        action="store_true",
        help="Run built-in example assessments",
    )
    parser.add_argument(
        "--interactive",
        "-i",
        action="store_true",
        help="Interactive mode (infer inputs from each description)",
    )
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  NORVAR — Governance, Risk and Compliance Intelligence")
    print("  Inference Engine v2")
    print("=" * 60 + "\n")

    missing = check_config()
    if missing:
        print("⚠️  CONFIGURATION REQUIRED")
        print("   Fill in these keys in .env:\n")
        for key in missing:
            print(f"   • {key}")
        print("\n   Your Anthropic API key: console.anthropic.com → API Keys")
        print("   Your Supabase keys: same as norvar_ingest.py")
        print("   Your Voyage AI key: same as norvar_ingest.py\n")
        return

    print("Connecting to services...")
    sb, voyage, claude = connect_services()
    print("✅  Connected.\n")

    if args.ask is not None:
        if args.ask.strip():
            run_ask_mode(args.ask.strip(), sb, voyage, claude)
        else:
            run_ask_interactive(sb, voyage, claude)
        return

    if args.describe:
        run_describe_mode(
            args.describe.strip(),
            sb,
            voyage,
            claude,
            contract_text=args.contract,
        )
        return

    if not args.examples and not args.interactive:
        args.examples = True
        args.interactive = True

    if args.examples:
        run_examples(sb, voyage, claude)

    if args.interactive:
        run_interactive(sb, voyage, claude)


if __name__ == "__main__":
    main()
