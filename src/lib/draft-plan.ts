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

function defaultSections(agreementTypeKey?: string): DraftPlanSection[] {
  if (agreementTypeKey === "ai_use") return AI_USE_SECTIONS;
  return DEFAULT_SECTIONS;
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
