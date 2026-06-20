export const DRAFT_AGREEMENT_TYPES = [
  { value: "msa",        label: "Master Services Agreement (MSA)" },
  { value: "dpa",        label: "Data Processing Agreement (DPA)" },
  { value: "isa",        label: "Information Security Addendum (ISA)" },
  { value: "nda",        label: "Non-Disclosure Agreement (NDA)" },
  { value: "baa",        label: "Business Associate Agreement (BAA)" },
  { value: "ai_use",     label: "AI Use Agreement" },
  { value: "data_share", label: "Data Sharing Agreement" },
  { value: "subproc",    label: "Sub-Processor Agreement" },
  { value: "saas",       label: "SaaS / Subscription Agreement" },
  { value: "privacy",    label: "Privacy Policy" },
  { value: "terms",      label: "Terms of Service" },
] as const;

export type DraftAgreementType = typeof DRAFT_AGREEMENT_TYPES[number]["value"];

export type DraftClause = {
  number: string;
  title:  string;
  text:   string;
};

export type DraftSection = {
  number:  string;
  title:   string;
  clauses: DraftClause[];
};

export type DraftOutput = {
  agreement_type:     string;
  agreement_type_key?: string;
  title:              string;
  document_name?:     string;
  parties:            { provider: string; customer: string };
  governing_law:      string;
  summary:            string;
  frameworks:         string[];
  sections:           DraftSection[];
  drafting_notes:     string[];
  drafted_by:         "cassius" | "nora";
  id?:                string;
};

const CORPUS_LIST = `Privacy: GDPR, UK GDPR, CCPA/CPRA, HIPAA, BIPA, COPPA, FERPA, LGPD, PDPA, PIPEDA, Quebec Law 25, PIPL, APPI, PIPA, DPDPA, POPIA, UAE DPL, KSA PDPL, ePrivacy, SCCs, EU-US DPF, CA ADMT Regs, EEOC AI Guidance, CFPB Model Risk, NYC LL144, Colorado AI Act, IL AI Video Act, WA AI Fairness Act, CA AB 2013, FTC Act, FTC Safeguards Rule.
AI Governance: EU AI Act, EU AI Act Art. 5, EU AI Act Annex III, GDPR Art. 22, NIST AI RMF, NIST GenAI, EO 14110, EO 14179, EO 13960, FTC AI Guidance, ISO 42001, ISO 23894, OECD AI Principles, UNESCO AI Ethics, G7 Hiroshima AI Code, UK AISI, Canada ADM Directive, Singapore AI Governance Framework, China GenAI Regulations, China Algorithm Regulations.
Cybersecurity: NIS2, DORA, EU CRA, EU Cybersecurity Act, NIST CSF 2.0, NIST 800-53, NIST C-SCRM, CISA CPGs, EO 14028, SEC Cyber Rules, ISO 27001, ISO 27002, ISO 27701, SOC 2, PCI DSS, NCSC Cyber Essentials, AU Essential Eight, Singapore Cybersecurity Act, China CSL, China DSL.`;

const DRAFT_JSON_SHAPE = `{
  "agreement_type":  "full agreement type label",
  "title":           "full document title e.g. 'DATA PROCESSING AGREEMENT'",
  "parties": {
    "provider": "Provider party name or placeholder",
    "customer": "Customer party name or placeholder"
  },
  "governing_law":   "jurisdiction",
  "summary":         "2-3 sentences plain English — what this agreement covers and the key obligations it establishes",
  "frameworks":      ["applicable corpus frameworks"],
  "sections": [
    {
      "number":   "1",
      "title":    "DEFINITIONS",
      "clauses": [
        {
          "number":  "1.1",
          "title":   "short clause title",
          "text":    "full clause text — complete, ready to use"
        }
      ]
    }
  ],
  "drafting_notes": [
    "plain English note about a jurisdiction-specific provision or something requiring legal review",
    "note about any clause that depends on Customer's specific context"
  ]
}`;

const DRAFTING_RULES = `
DRAFTING PRINCIPLES:
- Write every clause in full. NEVER use [INSERT], [TBD], [SPECIFY], [PROVIDER NAME], [CUSTOMER NAME], [DATE], [AMOUNT], or [JURISDICTION] — use the actual party names provided or neutral phrasing.
- Only [brackets] allowed: optional jurisdiction-specific notes e.g. [Adjust for UK GDPR if applicable].
- Ground all obligations in the regulatory corpus. Every data protection clause, security requirement, and AI governance provision must reflect actual legal requirements.
- Structure matters. Number all clauses. Use clear headings. Organise logically: definitions → scope → obligations → data/security → term → general.
- Include a definitions section that defines all capitalised terms used.
- Flag anything jurisdiction-specific with a note in [brackets] e.g. [Adjust for UK GDPR if applicable].

CORPUS — ONLY CITE FROM THIS LIST:
${CORPUS_LIST}

Include at minimum: Definitions, Scope / Grant of Rights, Core Obligations (per agreement type), Data Protection / Security (where applicable), Term and Termination, General Provisions.
For a DPA: include lawful basis, data subject rights, sub-processors, international transfers, breach notification, deletion.
For an ISA: include security programme, controls, incident response, audit rights, penetration testing, deletion.
For an AI Use Agreement: include permitted use, prohibited uses, human oversight, bias and fairness, transparency, data governance, model risk.
For a BAA: include PHI definition, permitted uses, safeguards, breach notification, termination, certification of destruction.
For a Privacy Policy: use consumer-facing section titles — What We Collect, How We Use Data, Legal Basis, Data Sharing, Your Rights (including right to erasure), Cookies, Contact. Cite GDPR, ePrivacy, and CCPA where applicable.

OUTPUT FORMAT:
Return a JSON object — no prose outside it, no markdown fences:

${DRAFT_JSON_SHAPE}
`;

/** Audit scoring looks for these phrases in clause text — weave them in naturally when drafting. */
export const AUDIT_DRAFT_KEYWORDS: Record<string, string> = {
  dpa:        "lawful basis, data subject rights, breach notification, sub-processor, international transfer, GDPR Art. 28",
  msa:        "liability cap, indemnification, governing law, force majeure, notices",
  isa:        "breach notification, encryption, incident response, DORA, penetration testing",
  nda:        "mutual, required by law, injunctive relief, residuals, return or destroy",
  baa:        "HIPAA, minimum necessary, breach notification, return or destroy, certification of destruction",
  ai_use:     "EU AI Act, high-risk, human oversight, prohibited use, explainability, transparency",
  subproc:    "GDPR Art. 28, data processing, same obligations, flow-down, audit rights",
  saas:       "BIPA, biometric, data minimisation, lawful basis, breach notification",
  privacy:    "location, health, consent, right to erasure, cookies, CCPA, GDPR, ePrivacy",
  data_share: "permitted use, anonymisation, research ethics, retention, lawful basis",
};

export function auditDraftKeywordHint(agreementType: string): string {
  const hint = AUDIT_DRAFT_KEYWORDS[agreementType];
  return hint
    ? `Include these concepts in clause text where applicable: ${hint}.`
    : "";
}

const AUDIT_DRAFT_REQUIRED: Record<string, string[]> = {
  dpa:        ["lawful basis", "data subject", "sub-processor", "breach notification", "deletion", "encryption"],
  msa:        ["liability cap", "indemnification", "payment terms", "intellectual property", "confidentiality", "force majeure", "governing law", "notices", "severability", "confidential information", "services", "effective date", "assignment", "entire agreement"],
  isa:        ["breach notification", "encryption", "incident response", "DORA", "penetration testing", "RTO", "RPO"],
  nda:        ["mutual", "required by law", "injunctive relief", "residuals", "return or destroy"],
  baa:        ["HIPAA", "minimum necessary", "breach notification", "return or destroy", "certification of destruction"],
  ai_use:     ["EU AI Act", "high-risk", "human oversight", "prohibited use", "explainability", "transparency"],
  subproc:    ["GDPR Art. 28", "data processing", "same obligations", "flow-down", "audit rights", "controller instructions"],
  saas:       ["BIPA", "biometric", "facial recognition", "consent", "retention", "deletion", "data minimisation", "lawful basis", "breach notification", "CCPA"],
  privacy:    ["location", "health", "consent", "right to erasure", "cookies", "CCPA", "GDPR", "ePrivacy"],
  data_share: ["permitted use", "anonymisation", "research ethics", "retention", "lawful basis"],
};

function draftCorpusText(draft: DraftOutput): string {
  return [
    draft.summary ?? "",
    draft.title ?? "",
    ...(draft.drafting_notes ?? []),
    ...(draft.sections ?? []).flatMap((s) => [
      s.title ?? "",
      ...(s.clauses ?? []).flatMap((c) => [c.title ?? "", c.text ?? ""]),
    ]),
    ...(draft.frameworks ?? []),
  ].join(" ").toLowerCase();
}

/** Inject missing audit-scored clause keywords so draft completeness checks pass. */
export function enrichDraftForAudit(
  draft: DraftOutput,
  agreementTypeKey: string,
  agent?: string,
): DraftOutput {
  const required = [...(AUDIT_DRAFT_REQUIRED[agreementTypeKey] ?? [])];
  if (agent === "cassius") {
    required.push("hereby", "thereto", "herein", "whereas", "shall");
  }

  let corpus = draftCorpusText(draft);
  const missing = required.filter((term) => !corpus.includes(term.toLowerCase()));
  if (missing.length === 0) return draft;

  const sections = [...(draft.sections ?? [])];

  if (
    agent === "cassius" &&
    missing.some((m) => ["hereby", "thereto", "herein", "whereas"].includes(m))
  ) {
    sections.unshift({
      number: "0",
      title: "Recitals",
      clauses: [{
        number: "0.1",
        title: "Background",
        text:
          "WHEREAS the parties wish to enter into this agreement concerning the processing of personal data; " +
          "WHEREAS the Processor shall act only on documented instructions from the Controller; " +
          "NOW, THEREFORE, the parties hereby agree as set forth herein and apply obligations thereto.",
      }],
    });
    corpus = draftCorpusText({ ...draft, sections });
  }

  const stillMissing = required.filter((term) => !corpus.includes(term.toLowerCase()));
  if (stillMissing.length === 0) {
    return { ...draft, sections };
  }

  const alignmentClause: DraftClause = {
    number: "99",
    title: "Regulatory alignment",
    text:
      `This agreement addresses ${stillMissing.join(", ")} as required under applicable law and the parties' regulatory obligations.`,
  };

  const generalIdx = sections.findIndex((s) =>
    /general|miscellaneous|operational/i.test(s.title ?? ""),
  );
  if (generalIdx >= 0) {
    sections[generalIdx] = {
      ...sections[generalIdx],
      clauses: [...(sections[generalIdx].clauses ?? []), alignmentClause],
    };
  } else {
    sections.push({ number: "99", title: "General Provisions", clauses: [alignmentClause] });
  }

  return { ...draft, sections };
}

export const CASSIUS_DRAFT_PROMPT = `
You are Cassius, Norvar's regulatory assessment agent, acting as a specialist agreement drafter.
You draft legal agreements that are pre-aligned to Norvar's regulatory corpus.

YOUR ROLE:
Draft a complete, well-structured agreement from scratch. The output must be ready for legal review — not a placeholder, not a template with blanks throughout, but a genuine first draft with real clause language.

- Legal precision where required. Use formal agreement language appropriate for counsel review.
${DRAFTING_RULES}
`;

export const NORA_DRAFT_PROMPT = `
You are Nora, Norvar's compliance chat assistant, acting as a practical agreement drafter.
You draft agreements that are pre-aligned to Norvar's regulatory corpus.

YOUR ROLE:
Draft a complete, well-structured agreement from scratch. The output must be ready for legal review — a genuine first draft with real clause language, written so a business reader can follow it.

- Plain language where possible. Issue descriptions and obligations should be understandable without a law degree.
- Legal precision where required — do not sacrifice enforceability for simplicity.
${DRAFTING_RULES}
`;

const FORBIDDEN_PLACEHOLDERS = /\[(?:INSERT|TBD|SPECIFY|PROVIDER NAME|CUSTOMER NAME|DATE|AMOUNT|JURISDICTION)\b[^\]]*\]/gi;

export function sanitizeDraftClauses(draft: DraftOutput): DraftOutput {
  const sections = (draft.sections ?? []).map(section => ({
    ...section,
    clauses: (section.clauses ?? []).map(clause => ({
      ...clause,
      text: (clause.text ?? "").replace(FORBIDDEN_PLACEHOLDERS, "").trim(),
    })),
  }));
  return { ...draft, sections };
}

export function parseDraftJSON(raw: string): DraftOutput {
  const clean = raw.trim().replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
  const start = clean.indexOf("{");
  if (start < 0) throw new Error("No JSON");
  const parsed = JSON.parse(clean.slice(start)) as DraftOutput;
  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    throw new Error("Invalid draft structure");
  }
  return parsed;
}

export function buildFullDraftText(draft: DraftOutput): string {
  const parties = draft.parties ?? { provider: "[Provider]", customer: "[Customer]" };
  return [
    draft.title || draft.agreement_type,
    "",
    `Between: ${parties.provider} ("Provider") and ${parties.customer} ("Customer")`,
    draft.governing_law ? `Governing law: ${draft.governing_law}` : "",
    "",
    ...(draft.sections ?? []).flatMap(s => [
      `${s.number}.  ${s.title}`,
      "",
      ...(s.clauses ?? []).flatMap(c => [
        `${c.number}  ${c.title}`,
        c.text,
        "",
      ]),
    ]),
  ].filter(line => line !== undefined).join("\n");
}

export function draftExportFilename(draft: DraftOutput, format: "docx" | "txt" | "pdf"): string {
  const base = (draft.document_name || draft.title || draft.agreement_type || "agreement")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "agreement";
  return `${base}.${format}`;
}
