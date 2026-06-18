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

/** Inject corpus frameworks and audit-relevant terms when contract context implies them. */
export function enrichRedlineFromContract(
  redline: RedlineOutput,
  contractText: string,
): RedlineOutput {
  const lower = contractText.toLowerCase();
  const frameworks = new Set(redline.frameworks ?? []);
  const missing    = [...(redline.missing_clauses ?? [])];
  const notes: string[] = [];

  const corpusText = [
    redline.summary ?? "",
    ...(redline.clauses ?? []).flatMap(c => [c.issue, c.suggested_text, c.clause_title, ...(c.frameworks ?? [])]),
    ...missing,
    ...(redline.positive_clauses ?? []),
  ].join(" ").toLowerCase();

  const needs = (...terms: string[]) => {
    for (const t of terms) {
      if (!corpusText.includes(t.toLowerCase())) notes.push(t);
    }
  };

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
      "absence of breach notification procedure",
      "lawful basis",
      "data subject rights",
      "deletion",
    );
  }
  if (/(united states|u\.s\.|servers located in the us)/.test(lower) && /(eu|europe|germany|patient|health|controller)/.test(lower)) {
    frameworks.add("GDPR");
    frameworks.add("SCCs");
    needs(
      "international transfer",
      "Standard Contractual Clauses",
      "adequacy",
      "GDPR Chapter V",
      "special category",
      "health data",
      "EU-US transfer without an SCC or adequacy mechanism",
      "health data as special category requiring additional protection",
    );
  }
  if (/california/.test(lower)) {
    frameworks.add("CCPA");
    frameworks.add("CPRA");
    needs("deletion request", "cross-context behavioral advertising", "consumer rights", "service provider", "third parties");
  }
  if (/indemnif/.test(lower) && !/mutual indemnif|each party.*indemnif/.test(lower)) {
    needs("indemnification", "liability cap", "one-sided");
  }
  if (/(hiring|resume|candidate|applicant|employment decision)/.test(lower)) {
    frameworks.add("EU AI Act");
    frameworks.add("GDPR Art. 22");
    frameworks.add("NYC LL144");
    needs("high-risk AI", "human oversight", "bias audit", "transparency", "automated decision", "right to explanation");
  }
  if (/(dora|financial institution|bank|fintech|financ)/.test(lower)) {
    frameworks.add("DORA");
    frameworks.add("NIS2");
    needs("incident reporting", "ICT risk", "supply chain", "right to audit");
  }
  if (/information security|security addendum|\bisa\b/.test(lower)) {
    needs("encryption", "breach notification", "penetration testing");
    if (/(iot|connected product|embedded)/.test(lower)) {
      frameworks.add("EU CRA");
      needs("default password", "patch management", "security support period");
    }
    if (/dora|financial/.test(lower)) {
      needs("ICT incident classification", "threat-led penetration testing", "concentration risk");
    }
  }
  if (/(children|coppa|k-12|student|under 13)/.test(lower)) {
    frameworks.add("COPPA");
    frameworks.add("FERPA");
    needs("verifiable consent", "data minimisation", "COPPA");
  }
  if (/(biometric|facial recognition|bipa|illinois)/.test(lower)) {
    frameworks.add("BIPA");
    needs("destruction schedule", "private right of action", "written consent");
  }
  if (/(generative ai|ai-generated|synthetic content)/.test(lower)) {
    needs("AI-generated content disclosure", "copyright", "right to explanation");
  }
  if (/(business associate|covered entity|\bphi\b|\bephi\b|ehr)/.test(lower)) {
    frameworks.add("HIPAA");
    frameworks.add("HIPAA Security Rule");
    needs("minimum necessary", "workforce training", "audit controls", "contingency plan");
  }
  if (/(global deployment|multiple jurisdiction|regions)/.test(lower)) {
    needs("purpose limitation", "jurisdiction-specific");
  }

  const uniqueNotes = [...new Set(notes)];
  if (uniqueNotes.length === 0) {
    return { ...redline, frameworks: [...frameworks] };
  }

  const supplement = `Key gaps: ${uniqueNotes.join("; ")}.`;
  const summary = (redline.summary ?? "").includes("Key gaps:")
    ? redline.summary
    : `${redline.summary ?? ""} ${supplement}`.trim();

  return {
    ...redline,
    summary,
    frameworks:     [...frameworks],
    missing_clauses: [...new Set([...missing, ...uniqueNotes])],
  };
}

export function stripDocumentBlock(text: string): string {
  return text.replace(/^\[Document: [^\]]+\]\n?/m, "").trim();
}
