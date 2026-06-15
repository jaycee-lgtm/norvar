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

const CORPUS_LIST = `Privacy: GDPR, UK GDPR, CCPA/CPRA, HIPAA, BIPA, COPPA, FERPA, LGPD, PDPA, PIPEDA, Quebec Law 25, PIPL, APPI, PIPA, DPDPA, POPIA, UAE DPL, KSA PDPL, ePrivacy, SCCs, EU-US DPF, CA ADMT Regs, EEOC AI Guidance, CFPB Model Risk, NYC LL144, Colorado AI Act, IL AI Video Act, WA AI Fairness Act, CA AB 2013, FTC Act, FTC Safeguards Rule, FERPA.
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
Overall status rules:
- "do_not_sign": one or more high severity non_compliant clauses present
- "significant_issues": one or more high severity issues (weak or missing)
- "needs_work": medium severity issues only
- "clean": no issues or low severity recommendations only

Only include clauses in the "clauses" array if they have an issue. Put compliant clauses in "positive_clauses" instead.
Order clauses by severity descending.`;

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

export function parseRedlineJSON(raw: string): RedlineOutput {
  let s = raw.trim().replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON object found in response");
  s = s.slice(start);
  try {
    return JSON.parse(s) as RedlineOutput;
  } catch {
    const stack: string[] = [];
    let inStr = false, esc = false;
    for (const c of s) {
      if (inStr) { esc = c === "\\" && !esc; if (!esc && c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) stack.pop();
    }
    return JSON.parse(s + stack.reverse().join("")) as RedlineOutput;
  }
}

export function normalizeRedlineOutput(
  redline: RedlineOutput,
  agent: "cassius" | "nora",
  detectedType: string,
): RedlineOutput {
  const next = { ...redline };
  next.redline_by = agent;
  next.agreement_type = next.agreement_type || detectedType;

  const sevRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  next.clauses = (next.clauses ?? []).sort((a, b) =>
    (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0),
  );

  const hasDoNotSign = next.clauses.some(c => c.severity === "high" && c.status === "non_compliant");
  const hasHigh      = next.clauses.some(c => c.severity === "high");
  const hasMedium    = next.clauses.some(c => c.severity === "medium");
  if (hasDoNotSign)       next.overall_status = "do_not_sign";
  else if (hasHigh)       next.overall_status = "significant_issues";
  else if (hasMedium)     next.overall_status = "needs_work";
  else                    next.overall_status = "clean";

  return next;
}

export function stripDocumentBlock(text: string): string {
  return text.replace(/^\[Document: [^\]]+\]\n?/m, "").trim();
}
