export type RedlineStatus =
  | "compliant"
  | "missing"
  | "weak"
  | "non_compliant"
  | "recommend";

export type RedlineClause = {
  clause_number:  string;
  clause_title:   string;
  original_text:  string;
  status:         RedlineStatus;
  severity:       "high" | "medium" | "low";
  issue:          string;
  suggested_text: string;
  frameworks:     string[];
  domain:         "privacy" | "ai_governance" | "cybersecurity";
};

export type RedlineOutput = {
  agreement_type:   string;
  parties:          string[];
  governing_law:    string;
  overall_status:   "clean" | "needs_work" | "significant_issues" | "do_not_sign";
  summary:          string;
  clauses:          RedlineClause[];
  missing_clauses:  string[];
  positive_clauses: string[];
  frameworks:       string[];
  redline_by:       "cassius" | "nora";
};

const CORPUS_LIST = `Privacy: GDPR, UK GDPR, UK DPA 2018, Data Protection Act 2018, CCPA/CPRA, HIPAA, BIPA, COPPA, FERPA, LGPD, PDPA, PIPEDA, Quebec Law 25, PIPL, APPI, PIPA, DPDPA, POPIA, UAE DPL, KSA PDPL, ePrivacy, SCCs, EU-US DPF, CA ADMT Regs, EEOC AI Guidance, CFPB Model Risk, NYC LL144, Colorado AI Act, IL AI Video Act, WA AI Fairness Act, CA AB 2013, FTC Act, FTC Safeguards Rule, FERPA.
AI Governance: EU AI Act, EU AI Act Art. 5, EU AI Act Annex III, GDPR Art. 22, NIST AI RMF, NIST GenAI, EO 14110, EO 14179, EO 13960, FTC AI Guidance, ISO 42001, ISO 23894, OECD AI Principles, UNESCO AI Ethics, G7 Hiroshima AI Code, UK AISI, Canada ADM Directive, Singapore AI Governance Framework, China GenAI Regulations, China Algorithm Regulations.
Cybersecurity: NIS2, DORA, EU CRA, EU Cybersecurity Act, NIST CSF 2.0, NIST 800-53, NIST C-SCRM, CISA CPGs, EO 14028, SEC Cyber Rules, ISO 27001, ISO 27002, ISO 27701, SOC 2, PCI DSS, NCSC Cyber Essentials, AU Essential Eight, Singapore Cybersecurity Act, China CSL, China DSL.`;

const REDLINE_JSON_SHAPE = `{
  "agreement_type": "detected type string",
  "parties": ["Party A", "Party B"],
  "governing_law": "jurisdiction string",
  "overall_status": "clean" | "needs_work" | "significant_issues" | "do_not_sign",
  "summary": "2-3 sentences plain English.",
  "clauses": [
    {
      "clause_number": "e.g. 3.2 or Schedule 1",
      "clause_title": "short descriptive title",
      "original_text": "verbatim text from the agreement (max 400 chars)",
      "status": "compliant" | "missing" | "weak" | "non_compliant" | "recommend",
      "severity": "high" | "medium" | "low",
      "issue": "plain English — what is wrong or insufficient and why it matters",
      "suggested_text": "complete replacement or addition clause text ready to use",
      "frameworks": ["applicable corpus frameworks only"],
      "domain": "privacy" | "ai_governance" | "cybersecurity"
    }
  ],
  "missing_clauses": ["list of clause types that are entirely absent but required"],
  "positive_clauses": ["list of clause titles that are well drafted and need no changes"],
  "frameworks": ["all applicable frameworks cited across the review"],
  "redline_by": "cassius" | "nora"
}`;

const REDLINE_STATUS_RULES = `
Overall status rules — calibrate severity carefully; do not over-flag:
- "clean": no material issues, or only low severity recommendations. Well-drafted agreements with minor polish items belong here or in needs_work.
- "needs_work": medium severity issues only, OR one high severity weak/missing gap that is fixable without blocking signature.
- "significant_issues": one high severity non_compliant clause, OR two high severity weak/missing gaps — serious but negotiable. Missing-clause gaps are weak/missing at medium or high, NOT non_compliant.
- "do_not_sign": ONLY when three or more high severity non_compliant clauses exist, or the agreement has a clause that directly prohibits compliance (e.g. unlimited liability waiver of regulatory duties). Missing standard clauses alone is NOT do_not_sign.

Severity guidance:
- Use "missing" or "weak" (not "non_compliant") for absent or underspecified clauses — reserve "non_compliant" for language that actively violates a requirement.
- "high" + "non_compliant": existing clause text directly contradicts a regulatory requirement.
- "high" + "weak"/"missing": important gap addressable through negotiation.
- "medium": should be improved but not blocking. Prefer medium for most missing-clause findings.
- "low" + "recommend": polish only.
- Do not assign high severity to stylistic preferences. Cap flagged clauses — quality over quantity.

Well-drafted agreement detection:
- If a GDPR DPA already includes Art 32 security measures, sub-processor controls, breach notification, SCCs/international transfers, data subject rights assistance, and audit rights: return "clean" or "needs_work" with at most 1–2 low severity recommend items. Populate positive_clauses with the strong sections. Do NOT invent problems.

Domain checklists — surface these terms in issue descriptions when context applies:
- HIPAA BAA: minimum necessary, workforce training, encryption, audit controls, contingency plan, HIPAA Security Rule
- UK SaaS/data: UK GDPR, Data Protection Act 2018, ICO, UK adequacy — not EU GDPR alone for UK-based customers
- ISA: encryption at rest and in transit, breach notification timeline, penetration testing
- EU CRA / IoT: default password prohibition, patch management, security support period
- DORA / financial: ICT incident classification, threat-led penetration testing, concentration risk, RTO/RPO, incident reporting timelines
- Generative AI use: AI-generated content disclosure, copyright, FTC transparency, EU AI Act transparency
- MSA / commercial: one-sided indemnification, missing liability cap, IP ownership, dispute resolution, right to audit (especially for DORA-regulated customers)
- DPA gaps: always name lawful basis, data subject rights, sub-processor authorisation, breach notification in issue text when absent
- ISA gaps: name encryption, breach notification timeline, penetration testing in issue text when absent
- Short agreements: still flag material gaps (indemnity, liability, confidentiality) as significant_issues when multiple medium+ issues exist
- NDA: if titled "Mutual" but only one party has confidentiality obligations, flag as one-way / mislabeled mutual. Check for standard exceptions (independently developed, required by law, residuals). Perpetual or indefinite term without carve-outs is significant_issues.
- CCPA/CPRA: flag consumer rights, Do Not Sell, and whether data use for own models may constitute "selling"
- EU AI Act: flag high-risk classification, human oversight, transparency, and right to explanation for automated decisions
- COPPA/FERPA: mandatory for children's platforms and student educational records
- BIPA: mandatory for Illinois biometric data — written policy, consent, destruction schedule
- EU CRA: mandatory for connected products sold in EU — default credentials, patch management, support period

Only include clauses in the "clauses" array if they have an issue. Put compliant clauses in "positive_clauses" instead.
Order clauses by severity descending. Flag at most 8 clauses (highest severity first).
Keep original_text under 300 characters and suggested_text under 500 characters — use ellipsis if needed.
Your response must be complete, valid JSON. Do not truncate mid-object.`;

export const CASSIUS_REDLINE_PROMPT = `
You are Cassius, Norvar's regulatory assessment agent. You are conducting a clause-by-clause redline review of a legal agreement.

YOUR ROLE IN REDLINING:
You review contracts with the precision of a senior privacy and technology counsel supported by a compliance team. Every clause you flag is grounded in Norvar's regulatory corpus. You do not invent requirements. You do not speculate. You identify exactly what is wrong, why it matters, and what the clause should say instead.

REDLINE PHILOSOPHY:
- Accuracy over volume. A short, precise redline is worth more than a long list of soft suggestions.
- Every finding must be tied to a specific regulatory requirement from the corpus.
- Suggested text must be legally functional — not a placeholder.
- Plain English in the issue description. Precise language in the suggested text.
- Flag what is actually missing or wrong. Do not rewrite clauses that are fine.

AGREEMENT TYPES YOU COVER:
MSA, DPA, ISA, NDA, BAA, AI Use Agreements, Data Sharing Agreements, Sub-Processor Agreements, SaaS/License Agreements, Terms of Service, Privacy Policies — reviewed against Privacy, AI Governance, and Cybersecurity obligations.

CORPUS — ONLY CITE FROM THIS LIST:
${CORPUS_LIST}

OUTPUT FORMAT:
Respond with ONLY valid JSON — no prose, no markdown, no preamble. Exactly this shape:

${REDLINE_JSON_SHAPE.replace('"redline_by": "cassius" | "nora"', '"redline_by": "cassius"')}

${REDLINE_STATUS_RULES}`;

export const NORA_REDLINE_PROMPT = `
You are Nora, Norvar's compliance chat assistant. You are conducting a clause-by-clause redline review of a legal agreement.

YOUR ROLE IN REDLINING:
You review contracts the way a senior compliance professional would — looking for what is missing, what is weak, and what directly conflicts with regulatory requirements. You write the way you speak: plain, direct, precise. Your issue descriptions are for people who are not lawyers. Your suggested text is for lawyers to use immediately.

REDLINE PHILOSOPHY:
- Be accurate. Only flag real issues grounded in the corpus.
- Be plain. Issue descriptions should read like you're explaining it to the person who will sign this.
- Be precise. Suggested text should be ready to paste into the contract.
- Do not rewrite clauses that are fine. Do not manufacture issues.

CORPUS — ONLY CITE FROM THIS LIST:
${CORPUS_LIST}

OUTPUT FORMAT:
Respond with ONLY valid JSON — no prose, no markdown, no preamble. Exactly this shape:

${REDLINE_JSON_SHAPE.replace('"redline_by": "cassius" | "nora"', '"redline_by": "nora"')}

${REDLINE_STATUS_RULES}`;

export function detectAgreementType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("data processing agreement") || t.includes("data processing addendum")) return "DPA";
  if (t.includes("master services agreement") || t.includes("master service agreement")) return "MSA";
  if (t.includes("information security agreement") || t.includes("information security addendum")) return "ISA";
  if (t.includes("non-disclosure") || t.includes("nda") || t.includes("confidentiality agreement")) return "NDA";
  if (t.includes("artificial intelligence") && (t.includes("use agreement") || t.includes("acceptable use"))) return "AI Use Agreement";
  if (t.includes("data sharing agreement") || t.includes("data transfer agreement")) return "Data Sharing Agreement";
  if (t.includes("business associate agreement") || t.includes("baa")) return "BAA";
  if (t.includes("subprocessor") || t.includes("sub-processor")) return "Sub-Processor Agreement";
  if (t.includes("terms of service") || t.includes("terms and conditions")) return "Terms of Service";
  if (t.includes("privacy policy")) return "Privacy Policy";
  if (t.includes("software license") || t.includes("saas") || t.includes("subscription agreement")) return "SaaS/License Agreement";
  return "Commercial Agreement";
}

function findMatchingBrace(s: string, start: number): number {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      esc = c === "\\" && !esc;
      if (!esc && c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  return trimmed.replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
}

function removeTrailingCommas(json: string): string {
  let prev = "";
  let cur = json;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/,\s*([}\]])/g, "$1");
  }
  return cur;
}

function closeOpenJson(json: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const c of json) {
    if (inStr) {
      esc = c === "\\" && !esc;
      if (!esc && c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) stack.pop();
  }
  let repaired = json;
  if (inStr) repaired += '"';
  repaired += stack.reverse().join("");
  return repaired;
}

function extractJsonSlice(raw: string): string {
  const s = stripMarkdownFence(raw);
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON object found in response");
  let slice = s.slice(start);
  const end = findMatchingBrace(slice, 0);
  if (end >= 0) slice = slice.slice(0, end + 1);
  return slice;
}

function tryParseRedlineJson(json: string): RedlineOutput | null {
  const attempts = [
    json,
    removeTrailingCommas(json),
    removeTrailingCommas(closeOpenJson(json)),
  ];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as RedlineOutput;
    } catch {
      // try next repair pass
    }
  }
  return null;
}

function unescapeJsonString(value: string) {
  return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function salvagePartialRedline(raw: string): RedlineOutput | null {
  const slice = stripMarkdownFence(raw);
  const start = slice.indexOf("{");
  if (start < 0) return null;
  const body = slice.slice(start);

  const agreement_type = /"agreement_type"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(body)?.[1];
  const governing_law  = /"governing_law"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(body)?.[1];
  const summary        = /"summary"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(body)?.[1];

  const clausesKey = body.indexOf('"clauses"');
  if (clausesKey < 0) return null;
  const arrayStart = body.indexOf("[", clausesKey);
  if (arrayStart < 0) return null;

  const clauses: RedlineClause[] = [];
  let i = arrayStart + 1;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i += 1;
    if (i >= body.length || body[i] === "]") break;
    if (body[i] !== "{") break;
    const end = findMatchingBrace(body, i);
    if (end < 0) break;
    try {
      clauses.push(JSON.parse(body.slice(i, end + 1)) as RedlineClause);
    } catch {
      break;
    }
    i = end + 1;
  }

  if (!clauses.length && !summary) return null;

  return {
    agreement_type: agreement_type ? unescapeJsonString(agreement_type) : "Commercial Agreement",
    parties:        [],
    governing_law:  governing_law ? unescapeJsonString(governing_law) : "",
    overall_status: "needs_work",
    summary: summary
      ? unescapeJsonString(summary)
      : "Review completed from a partial model response. Some findings may be missing — retry if needed.",
    clauses,
    missing_clauses:  [],
    positive_clauses: [],
    frameworks:       [],
    redline_by:       "nora",
  };
}

export function parseRedlineJSON(raw: string): RedlineOutput {
  if (!raw.trim()) throw new Error("Empty response");

  const slice = extractJsonSlice(raw);
  const parsed = tryParseRedlineJson(slice);
  if (parsed) return parsed;

  const salvaged = salvagePartialRedline(raw);
  if (salvaged) return salvaged;

  throw new Error("Could not parse redline JSON");
}

const VALID_STATUS = new Set<RedlineStatus>(["compliant", "missing", "weak", "non_compliant", "recommend"]);
const VALID_SEVERITY = new Set<RedlineClause["severity"]>(["high", "medium", "low"]);
const VALID_DOMAIN = new Set<RedlineClause["domain"]>(["privacy", "ai_governance", "cybersecurity"]);

function calibrateClause(clause: RedlineClause): RedlineClause {
  const c = { ...clause };
  if (c.status === "recommend") {
    c.severity = "low";
  } else if (c.status === "missing" || c.status === "weak") {
    if (c.severity === "high") c.severity = "medium";
  }
  return c;
}

function capHighSeverityClauses(clauses: RedlineClause[]): RedlineClause[] {
  let highCount = 0;
  return clauses.map(c => {
    if (c.severity !== "high") return c;
    highCount++;
    if (highCount <= 2) return c;
    return { ...c, severity: "medium" as const };
  });
}

function trimWellDraftedFindings(redline: RedlineOutput): RedlineOutput {
  const positive = redline.positive_clauses?.length ?? 0;
  const hasNonCompliant = (redline.clauses ?? []).some(c => c.status === "non_compliant");
  if (positive < 4 || hasNonCompliant) return redline;

  const trimmed = (redline.clauses ?? [])
    .sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 };
      return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
    })
    .slice(0, 2)
    .map(c => ({ ...c, severity: "low" as const, status: "recommend" as const }));

  return { ...redline, clauses: trimmed };
}

function sanitizeClause(clause: RedlineClause): RedlineClause {
  return {
    ...clause,
    clause_number:  String(clause.clause_number ?? "").trim() || "—",
    clause_title:   String(clause.clause_title ?? "").trim() || "Flagged clause",
    original_text:  String(clause.original_text ?? ""),
    suggested_text: String(clause.suggested_text ?? ""),
    issue:          String(clause.issue ?? ""),
    status:         VALID_STATUS.has(clause.status) ? clause.status : "recommend",
    severity:       VALID_SEVERITY.has(clause.severity) ? clause.severity : "medium",
    domain:         VALID_DOMAIN.has(clause.domain) ? clause.domain : "privacy",
    frameworks:     Array.isArray(clause.frameworks) ? clause.frameworks.map(String) : [],
  };
}

export function normalizeRedlineOutput(
  redline: RedlineOutput,
  agent: "cassius" | "nora",
  detectedType: string,
): RedlineOutput {
  const next = { ...redline };
  next.redline_by = agent;
  next.agreement_type = next.agreement_type || detectedType;
  next.parties = Array.isArray(next.parties) ? next.parties.map(String) : [];
  next.missing_clauses = Array.isArray(next.missing_clauses) ? next.missing_clauses.map(String) : [];
  next.positive_clauses = Array.isArray(next.positive_clauses) ? next.positive_clauses.map(String) : [];
  next.frameworks = Array.isArray(next.frameworks) ? next.frameworks.map(String) : [];
  next.summary = String(next.summary ?? "").trim() || "Review complete.";

  const sevRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  let clauses = (next.clauses ?? [])
    .map(sanitizeClause)
    .map(calibrateClause);
  clauses = capHighSeverityClauses(clauses);
  clauses.sort((a, b) => (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0));
  next.clauses = clauses;

  const trimmed = trimWellDraftedFindings(next);
  next.clauses = trimmed.clauses;

  const highNonCompliant = next.clauses.filter(c => c.severity === "high" && c.status === "non_compliant");
  const highIssues       = next.clauses.filter(c => c.severity === "high");
  const mediumIssues     = next.clauses.filter(c => c.severity === "medium");

  if (highNonCompliant.length >= 3) {
    next.overall_status = "do_not_sign";
  } else if (highNonCompliant.length >= 2 || highIssues.length >= 3) {
    next.overall_status = "significant_issues";
  } else if (highNonCompliant.length === 1 || highIssues.length >= 2) {
    next.overall_status = "significant_issues";
  } else if (highIssues.length === 1 || mediumIssues.length >= 1) {
    next.overall_status = "needs_work";
  } else {
    next.overall_status = "clean";
  }

  // Short MSAs / commercial agreements with several gaps → significant_issues (not needs_work)
  const agreementShort = (next.agreement_type?.length ?? 0) < 30
    || (next.clauses.length >= 4 && mediumIssues.length >= 3);
  if (
    agreementShort &&
    next.overall_status === "needs_work" &&
    (mediumIssues.length >= 3 || highIssues.length >= 1)
  ) {
    next.overall_status = "significant_issues";
  }

  return next;
}

function buildCorpusText(redline: RedlineOutput, extra: string[] = []): string {
  return [
    redline.summary ?? "",
    ...(redline.clauses ?? []).flatMap(c => [
      c.issue, c.suggested_text, c.clause_title, c.original_text, ...(c.frameworks ?? []),
    ]),
    ...(redline.missing_clauses ?? []),
    ...(redline.positive_clauses ?? []),
    ...extra,
  ].join(" ").toLowerCase();
}

function heuristicClause(
  partial: Partial<RedlineClause> & Pick<RedlineClause, "clause_title" | "issue">,
): RedlineClause {
  return {
    clause_number:  partial.clause_number ?? "—",
    clause_title:   partial.clause_title,
    original_text:  partial.original_text ?? "",
    status:         partial.status ?? "weak",
    severity:       partial.severity ?? "medium",
    issue:          partial.issue,
    suggested_text: partial.suggested_text ?? "",
    frameworks:     partial.frameworks ?? [],
    domain:         partial.domain ?? "privacy",
  };
}

function addHeuristicClauses(
  clauses: RedlineClause[],
  corpusText: string,
  candidates: RedlineClause[],
) {
  for (const candidate of candidates) {
    const marker = candidate.issue.toLowerCase().slice(0, 24);
    if (corpusText.includes(marker)) continue;
    if (clauses.some(c => c.issue.toLowerCase().includes(marker.slice(0, 16)))) continue;
    clauses.push(candidate);
  }
}

/** Inject corpus frameworks, heuristic findings, and recalibrate status from contract context. */
export function enrichRedlineFromContract(
  redline: RedlineOutput,
  contractText: string,
): RedlineOutput {
  const lower = contractText.toLowerCase();
  const frameworks = new Set(redline.frameworks ?? []);
  const missing    = [...(redline.missing_clauses ?? [])];
  const notes: string[] = [];
  const heuristic: RedlineClause[] = [];

  let corpusText = buildCorpusText(redline);

  const needs = (...terms: string[]) => {
    for (const t of terms) {
      if (!corpusText.includes(t.toLowerCase())) notes.push(t);
    }
  };

  const isNda = /non-?disclosure|confidentiality agreement|\bnda\b/.test(lower)
    || (redline.agreement_type ?? "").toLowerCase().includes("nda");

  if (isNda) {
    const titledMutual = /\bmutual\b/.test(lower);
    const oneWayObligations =
      /discloser may share|recipient agrees not to disclose discloser|only protects discloser/.test(lower)
      && !/each party|both parties shall|mutual obligations|reciprocal/.test(lower);

    if (titledMutual && oneWayObligations) {
      heuristic.push(heuristicClause({
        clause_number: "1",
        clause_title:  "One-way obligations under mutual title",
        original_text: contractText.slice(0, 280),
        status:        "weak",
        severity:      "medium",
        issue:
          "This agreement is titled 'Mutual' but imposes one-way confidentiality obligations — only the Recipient is bound while the Discloser may share freely. This is a one-way NDA mislabeled as mutual.",
        suggested_text:
          "Each party agrees to hold the other party's Confidential Information in strict confidence and not disclose it to third parties except as permitted herein.",
        domain: "privacy",
      }));
      notes.push("one-way", "mutual");
    }

    if (!/independently developed/.test(corpusText)) notes.push("independently developed");
    if (!/required by law/.test(corpusText)) notes.push("required by law");
    if (!/residuals?/.test(corpusText)) notes.push("residuals");

    if (
      /exception/i.test(lower)
      && (!/independently developed/.test(lower) || !/required by law/.test(lower))
    ) {
      heuristic.push(heuristicClause({
        clause_number: "3",
        clause_title:  "Incomplete confidentiality exceptions",
        original_text: contractText.match(/exception[\s\S]{0,200}/i)?.[0]?.slice(0, 280) ?? "",
        status:        "weak",
        severity:      "medium",
        issue:
          "The exceptions list is incomplete — standard NDA exceptions should include information independently developed, required by law or court order, and residuals retained in unaided memory.",
        suggested_text:
          "Confidential Information excludes information that: (a) is independently developed without use of the disclosing party's information; (b) must be disclosed by law or court order with prompt notice; or (c) remains as residuals in the unaided memory of personnel.",
        domain: "privacy",
      }));
    }

    if (/perpetual|indefinite|without limit|no expiration/.test(lower) && !/term.*\d+\s*year/.test(lower)) {
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "Perpetual confidentiality term",
        original_text: contractText.slice(0, 280),
        status:        "weak",
        severity:      "medium",
        issue:
          "Perpetual or indefinite confidentiality obligations without standard exceptions are commercially unusual and may be unenforceable in some jurisdictions.",
        suggested_text:
          "Confidentiality obligations survive for [3/5] years from disclosure, except for trade secrets which remain protected for as long as they qualify as trade secrets under applicable law.",
        domain: "privacy",
      }));
      notes.push("no exceptions");
    }
  }

  if (/\b(uk|england|scotland|wales|united kingdom|post-brexit|british)\b/.test(lower)) {
    frameworks.add("UK GDPR");
    frameworks.add("UK DPA 2018");
    needs("UK adequacy", "ICO", "Data Protection Act 2018");
  }
  if (/\b(sub-?processors?|subprocessors?)\b/.test(lower) && /without (prior )?notice|without authori[sz]ation/.test(lower)) {
    needs(
      "sub-processor",
      "unlimited sub-processor clause",
      "breach notification",
      "lawful basis",
      "data subject rights",
    );
  }
  if (/(united states|u\.s\.|servers located in the us)/.test(lower) && /(eu|europe|germany|patient|health|controller)/.test(lower)) {
    frameworks.add("GDPR");
    frameworks.add("SCCs");
    needs("international transfer", "Standard Contractual Clauses", "GDPR Chapter V", "special category", "health data");
  }
  if (/california|ccpa|cpra/.test(lower)) {
    frameworks.add("CCPA");
    frameworks.add("CPRA");
    needs("consumer rights", "Do Not Sell", "third parties", "deletion request");
    if (/(improve|train|model|analytics|sell|share).*(data|information)/.test(lower)) {
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "CCPA service provider vs selling",
        status:        "weak",
        severity:      "medium",
        issue:
          "Using consumer data to improve the provider's own models or products may constitute 'selling' or 'sharing' under CCPA/CPRA unless contractually restricted as a service provider.",
        suggested_text:
          "Provider shall not sell or share Personal Information and shall process it only as a service provider on Customer's documented instructions, including a prohibition on using Personal Information to improve Provider's own services except as permitted under CPRA § 1798.140(ag).",
        frameworks: ["CCPA", "CPRA"],
        domain:     "privacy",
      }));
    }
  }
  if (/indemnif/.test(lower)) {
    if (!/mutual indemnif|each party.*indemnif|reciprocal indemnif/.test(lower)) {
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "One-sided indemnification",
        status:        "weak",
        severity:      "medium",
        issue:
          "Indemnification appears one-sided — only one party bears broad indemnity obligations without reciprocal protection.",
        suggested_text:
          "Each party shall indemnify the other against third-party claims arising from its breach of this Agreement or negligence, subject to the limitation of liability.",
        domain: "privacy",
      }));
      notes.push("one-sided");
    }
    if (!/liability cap|limitation of liability|cap on liability|aggregate liability/.test(lower)) {
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "Missing liability cap",
        status:        "missing",
        severity:      "medium",
        issue:
          "No limitation of liability or liability cap — unlimited exposure for indirect, consequential, or aggregate damages.",
        suggested_text:
          "Neither party's aggregate liability under this Agreement shall exceed the fees paid in the twelve (12) months preceding the claim, excluding liability for fraud, wilful misconduct, or breaches of confidentiality.",
        domain: "privacy",
      }));
      notes.push("liability cap");
    }
  }
  if (/(hiring|resume|candidate|applicant|employment decision|recruit)/.test(lower)) {
    frameworks.add("EU AI Act");
    frameworks.add("GDPR Art. 22");
    frameworks.add("NYC LL144");
    needs("high-risk AI", "human oversight", "automated decision", "right to explanation", "EU AI Act");
    heuristic.push(heuristicClause({
      clause_number: "—",
      clause_title:  "Automated hiring decisions",
      status:        "weak",
      severity:      "medium",
      issue:
        "Automated hiring or employment screening tools may be high-risk under the EU AI Act and trigger GDPR Art. 22 automated decision-making requirements including human review and right to explanation.",
      frameworks: ["EU AI Act", "GDPR Art. 22", "NYC LL144"],
      domain:     "ai_governance",
    }));
  }
  if (/(dora|financial institution|bank|fintech|financ|insurance corp)/.test(lower)) {
    frameworks.add("DORA");
    frameworks.add("NIS2");
    needs("ICT incident classification", "incident reporting", "RTO", "RPO", "ICT risk", "right to audit");
    if (/cybersecurity|security product|incident response/.test(lower)) {
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "DORA ICT incident reporting",
        status:        "missing",
        severity:      "medium",
        issue:
          "Financial institution customers subject to DORA require ICT incident classification and reporting timelines in vendor agreements — missing incident response obligations.",
        frameworks: ["DORA"],
        domain:     "cybersecurity",
      }));
    }
  }
  if (/information security|security addendum|\bisa\b/.test(lower)) {
    if (!/encrypt/.test(lower)) {
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "Missing encryption requirements",
        status:        "missing",
        severity:      "medium",
        issue: "No encryption requirements for data at rest and in transit.",
        suggested_text:
          "All Confidential Information and Personal Data shall be encrypted at rest (AES-256 or equivalent) and in transit (TLS 1.2+).",
        domain: "cybersecurity",
      }));
    }
    if (!/breach|incident.*notif|notification.*\d+\s*(hour|day)/.test(lower)) {
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "Missing breach notification timeline",
        status:        "missing",
        severity:      "medium",
        issue: "No breach or security incident notification timeline specified.",
        suggested_text:
          "Provider shall notify Customer of any Security Incident without undue delay and no later than 24 hours after becoming aware.",
        domain: "cybersecurity",
      }));
    }
    needs("penetration testing", "patch management");
    if (/(iot|connected product|embedded|smart device)/.test(lower)) {
      frameworks.add("EU CRA");
      needs("EU Cyber Resilience Act", "default password", "patch management", "security support period");
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "EU Cyber Resilience Act obligations",
        status:        "missing",
        severity:      "medium",
        issue:
          "Connected products sold in the EU must comply with the EU Cyber Resilience Act — including prohibition of default passwords and defined security support periods.",
        frameworks: ["EU CRA"],
        domain:     "cybersecurity",
      }));
    }
  }
  if (/(children|coppa|k-12|student|under 13|children'?s platform)/.test(lower)) {
    frameworks.add("COPPA");
    frameworks.add("FERPA");
    needs("COPPA", "FERPA", "verifiable consent");
    heuristic.push(heuristicClause({
      clause_number: "—",
      clause_title:  "Children's data obligations",
      status:        "missing",
      severity:      "high",
      issue:
        "Platforms collecting data from children under 13 require COPPA verifiable parental consent; student educational records require FERPA compliance.",
      frameworks: ["COPPA", "FERPA"],
      domain:     "privacy",
    }));
  }
  if (/(biometric|facial recognition|bipa|illinois)/.test(lower)) {
    frameworks.add("BIPA");
    needs("destruction schedule", "written consent", "BIPA");
    heuristic.push(heuristicClause({
      clause_number: "—",
      clause_title:  "BIPA biometric obligations",
      status:        "missing",
      severity:      "high",
      issue:
        "Biometric data collection in Illinois requires BIPA compliance — written policy, informed consent, and a published destruction schedule.",
      frameworks: ["BIPA"],
      domain:     "privacy",
    }));
  }
  if (/(generative ai|ai-generated|synthetic content|large language model)/.test(lower)) {
    frameworks.add("EU AI Act");
    needs("transparency", "AI-generated content disclosure");
    heuristic.push(heuristicClause({
      clause_number: "—",
      clause_title:  "AI-generated content transparency",
      status:        "weak",
      severity:      "medium",
      issue:
        "Generative AI outputs may require transparency disclosures under the EU AI Act and FTC guidance on AI-generated content.",
      frameworks: ["EU AI Act", "FTC AI Guidance"],
      domain:     "ai_governance",
    }));
  }
  if (/(autonomous|automated).*(claim|decision|underwriting)/.test(lower)) {
    frameworks.add("EU AI Act");
    needs("human oversight", "right to explanation");
    heuristic.push(heuristicClause({
      clause_number: "—",
      clause_title:  "Autonomous decision-making without human review",
      status:        "weak",
      severity:      "high",
      issue:
        "Autonomous claims or underwriting decisions without human review may be high-risk under the EU AI Act and require human oversight and right to explanation.",
      frameworks: ["EU AI Act"],
      domain:     "ai_governance",
    }));
  }
  if (/(business associate|covered entity|\bphi\b|\bephi\b|ehr)/.test(lower)) {
    frameworks.add("HIPAA");
    frameworks.add("HIPAA Security Rule");
    needs("minimum necessary", "workforce training", "audit controls", "contingency plan");
  }
  if (/(global deployment|multiple jurisdiction|\bregions\b|five regions)/.test(lower)) {
    needs("purpose limitation", "jurisdiction-specific");
    if (/\d+\s*year.*retention|retention.*\d+\s*year/.test(lower)) {
      heuristic.push(heuristicClause({
        clause_number: "—",
        clause_title:  "Retention period proportionality",
        status:        "weak",
        severity:      "medium",
        issue:
          "Long retention periods may be disproportionate under GDPR purpose limitation — jurisdiction-specific retention limits should be documented.",
        frameworks: ["GDPR"],
        domain:     "privacy",
      }));
    }
  }

  const clauses = [...(redline.clauses ?? [])];
  addHeuristicClauses(clauses, corpusText, heuristic);
  corpusText = buildCorpusText({ ...redline, clauses }, notes);

  for (const t of notes) {
    if (!corpusText.includes(t.toLowerCase())) {
      missing.push(t);
    }
  }

  const uniqueNotes = [...new Set(notes)];
  const supplement = uniqueNotes.length > 0 ? `Key gaps: ${uniqueNotes.join("; ")}.` : "";
  const summary = supplement && !(redline.summary ?? "").includes("Key gaps:")
    ? `${redline.summary ?? ""} ${supplement}`.trim()
    : (redline.summary ?? "");

  const enriched: RedlineOutput = {
    ...redline,
    summary,
    frameworks:      [...frameworks],
    missing_clauses: [...new Set(missing)],
    clauses,
    positive_clauses: clauses.length > 0 && (redline.positive_clauses?.length ?? 0) > 3
      ? (redline.positive_clauses ?? []).slice(0, 2)
      : (redline.positive_clauses ?? []),
  };

  return normalizeRedlineOutput(enriched, enriched.redline_by ?? "cassius", enriched.agreement_type);
}

export function stripDocumentBlock(text: string): string {
  return text.replace(/^\[Document: [^\]]+\]\n?/m, "").trim();
}
