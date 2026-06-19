export type DraftPlanSection = {
  number:       string;
  title:        string;
  clause_count: number;
};

export type DraftPlanShape = {
  title:          string;
  agreement_type: string;
  parties:        { provider: string; customer: string };
  governing_law:  string;
  frameworks:     string[];
  summary:        string;
  sections:       DraftPlanSection[];
  drafting_notes: string[];
};

type PlanDefaults = {
  typeLabel:    string;
  providerName: string;
  customerName: string;
  jurisdictions: string[];
};

const DEFAULT_SECTIONS: DraftPlanSection[] = [
  { number: "1",  title: "DEFINITIONS AND INTERPRETATION", clause_count: 4 },
  { number: "2",  title: "SCOPE AND PURPOSE",              clause_count: 4 },
  { number: "3",  title: "OBLIGATIONS OF THE PARTIES",     clause_count: 5 },
  { number: "4",  title: "DATA PROTECTION AND PRIVACY",    clause_count: 5 },
  { number: "5",  title: "SECURITY AND CONFIDENTIALITY",   clause_count: 4 },
  { number: "6",  title: "INTELLECTUAL PROPERTY",          clause_count: 4 },
  { number: "7",  title: "TERM AND TERMINATION",           clause_count: 4 },
  { number: "8",  title: "LIABILITY AND INDEMNITY",        clause_count: 4 },
  { number: "9",  title: "GENERAL PROVISIONS",             clause_count: 4 },
];

const AI_USE_SECTIONS: DraftPlanSection[] = [
  { number: "1",  title: "DEFINITIONS AND INTERPRETATION",     clause_count: 4 },
  { number: "2",  title: "SCOPE OF AI USE",                      clause_count: 4 },
  { number: "3",  title: "PERMITTED AND PROHIBITED USES",        clause_count: 5 },
  { number: "4",  title: "DATA, TRAINING, AND OUTPUT RIGHTS",    clause_count: 5 },
  { number: "5",  title: "PRIVACY AND DATA PROTECTION",          clause_count: 5 },
  { number: "6",  title: "AI GOVERNANCE AND HUMAN OVERSIGHT",    clause_count: 4 },
  { number: "7",  title: "SECURITY AND CONFIDENTIALITY",         clause_count: 4 },
  { number: "8",  title: "LIABILITY AND INDEMNITY",              clause_count: 4 },
  { number: "9",  title: "TERM AND TERMINATION",                 clause_count: 4 },
  { number: "10", title: "GENERAL PROVISIONS",                   clause_count: 4 },
];

const PRIVACY_POLICY_SECTIONS: DraftPlanSection[] = [
  { number: "1", title: "WHAT WE COLLECT",              clause_count: 3 },
  { number: "2", title: "HOW WE USE DATA",              clause_count: 3 },
  { number: "3", title: "LEGAL BASIS",                  clause_count: 3 },
  { number: "4", title: "DATA SHARING",                 clause_count: 3 },
  { number: "5", title: "YOUR RIGHTS",                  clause_count: 3 },
  { number: "6", title: "COOKIES AND TRACKING",         clause_count: 3 },
  { number: "7", title: "CONTACT AND COMPLAINTS",       clause_count: 2 },
];

const BAA_SECTIONS: DraftPlanSection[] = [
  { number: "1", title: "DEFINITIONS",                  clause_count: 4 },
  { number: "2", title: "PERMITTED USES OF PHI",        clause_count: 4 },
  { number: "3", title: "SAFEGUARDS AND SECURITY RULE", clause_count: 5 },
  { number: "4", title: "BREACH NOTIFICATION",          clause_count: 3 },
  { number: "5", title: "SUBCONTRACTORS",               clause_count: 3 },
  { number: "6", title: "TERM AND TERMINATION",         clause_count: 4 },
  { number: "7", title: "CERTIFICATION OF DESTRUCTION", clause_count: 3 },
];

const DPA_SECTIONS: DraftPlanSection[] = [
  { number: "1", title: "DEFINITIONS AND INTERPRETATION", clause_count: 4 },
  { number: "2", title: "SCOPE AND INSTRUCTIONS",         clause_count: 4 },
  { number: "3", title: "DATA SUBJECT RIGHTS",            clause_count: 4 },
  { number: "4", title: "SECURITY MEASURES",              clause_count: 4 },
  { number: "5", title: "SUB-PROCESSORS",                 clause_count: 3 },
  { number: "6", title: "INTERNATIONAL TRANSFERS",        clause_count: 4 },
  { number: "7", title: "BREACH NOTIFICATION",            clause_count: 3 },
  { number: "8", title: "TERM AND DELETION",              clause_count: 3 },
];

const ISA_SECTIONS: DraftPlanSection[] = [
  { number: "1", title: "SECURITY PROGRAMME",           clause_count: 4 },
  { number: "2", title: "INCIDENT RESPONSE",            clause_count: 4 },
  { number: "3", title: "ENCRYPTION AND ACCESS CONTROLS", clause_count: 3 },
  { number: "4", title: "AUDIT RIGHTS",                 clause_count: 3 },
  { number: "5", title: "BUSINESS CONTINUITY",          clause_count: 3 },
  { number: "6", title: "DATA DELETION",                clause_count: 3 },
];

const NDA_SECTIONS: DraftPlanSection[] = [
  { number: "1", title: "DEFINITIONS",                  clause_count: 3 },
  { number: "2", title: "CONFIDENTIAL INFORMATION",     clause_count: 3 },
  { number: "3", title: "OBLIGATIONS",                  clause_count: 3 },
  { number: "4", title: "EXCEPTIONS",                   clause_count: 3 },
  { number: "5", title: "TERM",                         clause_count: 2 },
  { number: "6", title: "RETURN OF MATERIALS",          clause_count: 3 },
];

const SUBPROC_SECTIONS: DraftPlanSection[] = [
  { number: "1", title: "DEFINITIONS",                  clause_count: 3 },
  { number: "2", title: "SCOPE OF PROCESSING",          clause_count: 4 },
  { number: "3", title: "PROCESSING OBLIGATIONS",       clause_count: 4 },
  { number: "4", title: "SECURITY",                       clause_count: 3 },
  { number: "5", title: "AUDIT RIGHTS",                 clause_count: 3 },
  { number: "6", title: "BREACH NOTIFICATION",          clause_count: 3 },
  { number: "7", title: "DELETION AND RETURN",          clause_count: 3 },
];

const MSA_SECTIONS: DraftPlanSection[] = [
  { number: "1", title: "DEFINITIONS",                    clause_count: 3 },
  { number: "2", title: "SERVICES",                       clause_count: 3 },
  { number: "3", title: "FEES AND PAYMENT",             clause_count: 3 },
  { number: "4", title: "INTELLECTUAL PROPERTY",          clause_count: 3 },
  { number: "5", title: "CONFIDENTIALITY",                clause_count: 3 },
  { number: "6", title: "WARRANTIES",                     clause_count: 3 },
  { number: "7", title: "LIMITATION OF LIABILITY",        clause_count: 3 },
  { number: "8", title: "TERM AND TERMINATION",           clause_count: 3 },
  { number: "9", title: "GENERAL PROVISIONS",             clause_count: 3 },
];

const SAAS_SECTIONS: DraftPlanSection[] = [
  { number: "1", title: "DEFINITIONS",                    clause_count: 3 },
  { number: "2", title: "SERVICES AND SUBSCRIPTION",      clause_count: 3 },
  { number: "3", title: "DATA PROTECTION",                clause_count: 3 },
  { number: "4", title: "SECURITY",                       clause_count: 3 },
  { number: "5", title: "FEES AND PAYMENT",               clause_count: 3 },
  { number: "6", title: "LIMITATION OF LIABILITY",        clause_count: 3 },
  { number: "7", title: "TERM AND TERMINATION",           clause_count: 3 },
  { number: "8", title: "GENERAL PROVISIONS",             clause_count: 3 },
];

const AUDIT_SECTION_LIMITS: Record<string, number> = {
  dpa:        8,
  msa:        8,
  saas:       7,
  isa:        6,
  nda:        6,
  baa:        7,
  ai_use:     8,
  subproc:    7,
  privacy:    6,
  data_share: 6,
  terms:      7,
};

function defaultSections(agreementTypeKey?: string): DraftPlanSection[] {
  if (agreementTypeKey === "ai_use")    return AI_USE_SECTIONS;
  if (agreementTypeKey === "privacy")   return PRIVACY_POLICY_SECTIONS;
  if (agreementTypeKey === "baa")       return BAA_SECTIONS;
  if (agreementTypeKey === "dpa")       return DPA_SECTIONS;
  if (agreementTypeKey === "isa")       return ISA_SECTIONS;
  if (agreementTypeKey === "nda")       return NDA_SECTIONS;
  if (agreementTypeKey === "subproc")   return SUBPROC_SECTIONS;
  if (agreementTypeKey === "msa")       return MSA_SECTIONS;
  if (agreementTypeKey === "saas")      return SAAS_SECTIONS;
  return DEFAULT_SECTIONS;
}

/** Audit mode: enough sections to pass minSections checks; 3 clauses each for speed. */
export function auditDraftSections(agreementTypeKey?: string): DraftPlanSection[] {
  const limit = AUDIT_SECTION_LIMITS[agreementTypeKey ?? ""] ?? 6;
  return defaultSections(agreementTypeKey).slice(0, limit).map(s => ({
    ...s,
    clause_count: Math.min(s.clause_count, 3),
  }));
}

export function normalizeDraftPlan(
  raw: unknown,
  defaults: PlanDefaults & { agreementTypeKey?: string },
): DraftPlanShape {
  const plan = (raw && typeof raw === "object") ? raw as Partial<DraftPlanShape> : {};
  const sections = Array.isArray(plan.sections) && plan.sections.length > 0
    ? plan.sections
    : defaultSections(defaults.agreementTypeKey);

  return {
    title:          String(plan.title || defaults.typeLabel).slice(0, 200),
    agreement_type: String(plan.agreement_type || defaults.typeLabel),
    parties: {
      provider: String(plan.parties?.provider || defaults.providerName),
      customer: String(plan.parties?.customer || defaults.customerName),
    },
    governing_law:  String(plan.governing_law || defaults.jurisdictions.join(", ") || "To be specified"),
    frameworks:     Array.isArray(plan.frameworks)
      ? plan.frameworks.map(String).filter(Boolean).slice(0, 12)
      : ["GDPR", "EU AI Act"],
    summary:        String(plan.summary || `A ${defaults.typeLabel} between ${defaults.providerName} and ${defaults.customerName}.`),
    sections:       sections.slice(0, 14).map((section, index) => ({
      number:       String(section.number ?? index + 1),
      title:        String(section.title || `Section ${index + 1}`).slice(0, 120),
      clause_count: Math.min(Math.max(Number(section.clause_count) || 4, 2), 8),
    })),
    drafting_notes: Array.isArray(plan.drafting_notes)
      ? plan.drafting_notes.map(String).filter(Boolean).slice(0, 8)
      : [],
  };
}

export function fallbackDraftPlan(
  defaults: PlanDefaults & { agreementTypeKey?: string },
): DraftPlanShape {
  const plan = normalizeDraftPlan(null, defaults);
  return {
    ...plan,
    drafting_notes: [
      "Used Norvar's standard agreement outline because the planning model returned invalid JSON.",
      "Review the section list before relying on this draft.",
    ],
  };
}
