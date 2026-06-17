// Norvar — Sprint 7: Petra Agreement Draft Quality Audit
// 20 scenarios testing Petra's drafting completeness, corpus grounding,
// structure, plain language, and jurisdiction awareness
// Tests /api/draft

export const DRAFT_QUERIES = [

  // ─── CORE AGREEMENT TYPES (7 queries) ────────────────────────────────────
  // One query per key agreement type. Tests that the right sections and
  // clause types appear for each agreement category.

  {
    id: "PT-01",
    label: "DPA — EU context, GDPR-grounded",
    type: "dpa",
    input: {
      agreement_type:       "dpa",
      agreement_type_label: "Data Processing Agreement (DPA)",
      provider_name:        "Norvar Inc.",
      customer_name:        "Acme GmbH",
      jurisdictions:        ["EU"],
      context:              "SaaS platform processing EU employee data including HR records and performance reviews",
    },
    expected: {
      mustHaveSections:   ["Definitions", "Scope", "Data Subject Rights", "Sub-Processors", "Security", "International Transfers", "Breach Notification", "Deletion"],
      mustHaveClauses:    ["lawful basis", "data subject", "sub-processor", "breach notification", "deletion", "encryption"],
      mustCiteFrameworks: ["GDPR", "GDPR Art. 28", "SCCs"],
      minSections:        6,
      minClauses:         15,
      mustHaveDraftingNotes: true,
    },
    redFlags: [
      "Does not include data subject rights section",
      "Does not include breach notification clause",
      "Does not cite GDPR Art. 28",
      "Does not include international transfer mechanism",
      "Fewer than 6 sections for a full DPA",
    ],
  },

  {
    id: "PT-02",
    label: "MSA — US context, SaaS product",
    type: "msa",
    input: {
      agreement_type:       "msa",
      agreement_type_label: "Master Services Agreement (MSA)",
      provider_name:        "CloudTech Inc.",
      customer_name:        "Enterprise Corp.",
      jurisdictions:        ["US Federal"],
      context:              "SaaS project management platform, B2B, no health or financial data",
    },
    expected: {
      mustHaveSections:   ["Definitions", "Services", "Fees", "Intellectual Property", "Confidentiality", "Warranties", "Limitation of Liability", "Term and Termination"],
      mustHaveClauses:    ["liability cap", "indemnification", "payment terms", "intellectual property", "confidentiality"],
      mustCiteFrameworks: [],
      minSections:        7,
      minClauses:         18,
      mustHaveDraftingNotes: false,
    },
    redFlags: [
      "Does not include a liability cap",
      "Does not include indemnification clause",
      "Does not include IP ownership provisions",
      "Fewer than 7 sections for a full MSA",
    ],
  },

  {
    id: "PT-03",
    label: "ISA — EU financial sector, DORA context",
    type: "isa",
    input: {
      agreement_type:       "isa",
      agreement_type_label: "Information Security Addendum (ISA)",
      provider_name:        "SecureOps Ltd.",
      customer_name:        "EuroBank SA",
      jurisdictions:        ["EU"],
      context:              "ICT service provider to a regulated EU financial institution subject to DORA",
    },
    expected: {
      mustHaveSections:   ["Security Programme", "Incident Response", "Audit Rights", "Business Continuity", "Data Deletion"],
      mustHaveClauses:    ["encryption", "penetration testing", "breach notification", "RTO", "RPO", "audit", "deletion"],
      mustCiteFrameworks: ["DORA", "ISO 27001", "NIS2"],
      minSections:        5,
      minClauses:         12,
      mustHaveDraftingNotes: true,
    },
    redFlags: [
      "Does not cite DORA for an EU financial institution context",
      "Does not include DORA-specific incident reporting timeline",
      "Does not include RTO/RPO requirements",
      "Does not include threat-led penetration testing (TLPT) reference",
    ],
  },

  {
    id: "PT-04",
    label: "NDA — bilateral, tech company context",
    type: "nda",
    input: {
      agreement_type:       "nda",
      agreement_type_label: "Non-Disclosure Agreement (NDA)",
      provider_name:        "TechVentures Inc.",
      customer_name:        "InvestCo Ltd.",
      jurisdictions:        ["US Federal", "UK"],
      context:              "Mutual NDA for M&A due diligence discussions",
    },
    expected: {
      mustHaveSections:   ["Definitions", "Confidential Information", "Obligations", "Exceptions", "Term", "Return of Materials"],
      mustHaveClauses:    ["mutual", "exceptions", "publicly available", "independently developed", "required by law", "return", "injunctive relief"],
      mustCiteFrameworks: [],
      minSections:        5,
      minClauses:         8,
      mustHaveDraftingNotes: false,
    },
    redFlags: [
      "Does not include standard confidentiality exceptions",
      "Does not include return of materials obligation",
      "Does not establish mutual obligations for both parties",
      "Missing 'required by law' disclosure exception",
    ],
  },

  {
    id: "PT-05",
    label: "BAA — HIPAA context, US healthcare",
    type: "baa",
    input: {
      agreement_type:       "baa",
      agreement_type_label: "Business Associate Agreement (BAA)",
      provider_name:        "HealthTech Inc.",
      customer_name:        "City Hospital",
      jurisdictions:        ["US Federal"],
      context:              "Cloud storage provider processing ePHI for a covered entity",
    },
    expected: {
      mustHaveSections:   ["Definitions", "Permitted Uses", "Safeguards", "Breach Notification", "Term and Termination", "Certification of Destruction"],
      mustHaveClauses:    ["protected health information", "minimum necessary", "safeguards", "breach notification", "subcontractors", "return or destroy"],
      mustCiteFrameworks: ["HIPAA", "HIPAA Privacy Rule", "HIPAA Security Rule"],
      minSections:        5,
      minClauses:         10,
      mustHaveDraftingNotes: true,
    },
    redFlags: [
      "Does not cite HIPAA as the governing framework",
      "Does not include minimum necessary standard",
      "Does not include certification of destruction on termination",
      "Does not address subcontractor BAA requirements",
      "Missing breach notification to covered entity",
    ],
  },

  {
    id: "PT-06",
    label: "AI Use Agreement — high-risk AI, EU deployment",
    type: "ai_use",
    input: {
      agreement_type:       "ai_use",
      agreement_type_label: "AI Use Agreement",
      provider_name:        "AI Platform GmbH",
      customer_name:        "Insurer AG",
      jurisdictions:        ["EU"],
      context:              "AI model for automated insurance claim assessment deployed in Germany",
    },
    expected: {
      mustHaveSections:   ["Definitions", "Permitted Use", "Prohibited Uses", "Human Oversight", "Transparency", "Data Governance", "Bias and Fairness", "Liability"],
      mustHaveClauses:    ["human oversight", "explainability", "prohibited", "bias", "transparency", "high-risk", "conformity"],
      mustCiteFrameworks: ["EU AI Act", "EU AI Act Annex III", "GDPR Art. 22"],
      minSections:        6,
      minClauses:         12,
      mustHaveDraftingNotes: true,
    },
    redFlags: [
      "Does not cite EU AI Act for a high-risk AI use case",
      "Does not include human oversight obligations",
      "Does not include prohibited use cases",
      "Does not reference GDPR Art. 22 automated decision rights",
      "Missing bias and fairness obligations",
    ],
  },

  {
    id: "PT-07",
    label: "Sub-Processor Agreement — GDPR chain",
    type: "subproc",
    input: {
      agreement_type:       "subproc",
      agreement_type_label: "Sub-Processor Agreement",
      provider_name:        "Infrastructure Co.",
      customer_name:        "SaaS Provider Ltd.",
      jurisdictions:        ["EU"],
      context:              "Cloud infrastructure provider acting as sub-processor to a GDPR-regulated processor",
    },
    expected: {
      mustHaveSections:   ["Definitions", "Scope", "Processing Obligations", "Security", "Audit Rights", "Breach Notification", "Deletion"],
      mustHaveClauses:    ["data processing", "same obligations", "controller instructions", "audit", "breach notification", "deletion", "liability"],
      mustCiteFrameworks: ["GDPR", "GDPR Art. 28"],
      minSections:        5,
      minClauses:         10,
      mustHaveDraftingNotes: false,
    },
    redFlags: [
      "Does not impose same obligations on sub-processor as processor has to controller",
      "Does not cite GDPR Art. 28(4)",
      "Does not include flow-down of controller instructions",
    ],
  },

  // ─── COMPLETENESS CHECKS (5 queries) ─────────────────────────────────────
  // Tests that drafts are complete — no placeholder text, all clauses written in full.

  {
    id: "PT-08",
    label: "Completeness — no placeholder clauses",
    type: "dpa",
    input: {
      agreement_type:       "dpa",
      agreement_type_label: "Data Processing Agreement (DPA)",
      provider_name:        "Tech Provider",
      customer_name:        "Client Co.",
      jurisdictions:        ["EU"],
      context:              "",
    },
    expected: {
      noPlaceholders: true,
      mustHaveClauses: [],
      minSections: 5,
      minClauses: 12,
    },
    redFlags: [
      "Contains [INSERT] placeholder text",
      "Contains [TBD] placeholder text",
      "Contains [SPECIFY] placeholder text",
      "Clause text is fewer than 30 characters (likely a stub)",
      "Section has zero clauses",
    ],
  },

  {
    id: "PT-09",
    label: "Completeness — definitions section has real definitions",
    type: "msa",
    input: {
      agreement_type:       "msa",
      agreement_type_label: "Master Services Agreement (MSA)",
      provider_name:        "Provider Inc.",
      customer_name:        "Customer Ltd.",
      jurisdictions:        ["US Federal"],
      context:              "",
    },
    expected: {
      mustHaveSections: ["Definitions"],
      mustHaveClauses:  ["confidential information", "services", "effective date"],
      noPlaceholders:   true,
      minSections:      6,
      minClauses:       15,
    },
    redFlags: [
      "Definitions section has fewer than 3 defined terms",
      "Definitions section only lists term names without actual definitions",
      "Uses capitalised terms not defined in the Definitions section",
    ],
  },

  {
    id: "PT-10",
    label: "Completeness — multi-jurisdiction has jurisdiction-specific notes",
    type: "dpa",
    input: {
      agreement_type:       "dpa",
      agreement_type_label: "Data Processing Agreement (DPA)",
      provider_name:        "Global SaaS Co.",
      customer_name:        "International Ltd.",
      jurisdictions:        ["EU", "UK", "US Federal", "Brazil"],
      context:              "Global SaaS platform with users in multiple jurisdictions",
    },
    expected: {
      mustHaveDraftingNotes: true,
      mustCiteFrameworks:    ["GDPR", "UK GDPR", "LGPD"],
      minSections:           6,
      minClauses:            15,
    },
    redFlags: [
      "Does not include drafting notes for a multi-jurisdiction agreement",
      "Does not cite UK GDPR separately from EU GDPR",
      "Does not cite LGPD for Brazil",
      "Treats all four jurisdictions identically without noting differences",
    ],
  },

  {
    id: "PT-11",
    label: "Completeness — party names used correctly throughout",
    type: "nda",
    input: {
      agreement_type:       "nda",
      agreement_type_label: "Non-Disclosure Agreement (NDA)",
      provider_name:        "TechStartup Inc.",
      customer_name:        "BigCorp Ltd.",
      jurisdictions:        ["US Federal"],
      context:              "",
    },
    expected: {
      partyNamesUsed:  ["TechStartup Inc.", "BigCorp Ltd."],
      noPlaceholders:  true,
      minSections:     4,
      minClauses:      6,
    },
    redFlags: [
      "Uses [Provider Name] or [Customer Name] instead of the actual party names",
      "Uses generic 'Party A' and 'Party B' without defining them",
      "Party names inconsistent across sections",
    ],
  },

  {
    id: "PT-12",
    label: "Completeness — general provisions fully drafted",
    type: "msa",
    input: {
      agreement_type:       "msa",
      agreement_type_label: "Master Services Agreement (MSA)",
      provider_name:        "SaaS Corp.",
      customer_name:        "Enterprise Inc.",
      jurisdictions:        ["US Federal"],
      context:              "",
    },
    expected: {
      mustHaveClauses:  ["governing law", "force majeure", "assignment", "severability", "entire agreement", "notices"],
      noPlaceholders:   true,
      minSections:      7,
      minClauses:       20,
    },
    redFlags: [
      "Missing governing law clause",
      "Missing force majeure clause",
      "Missing severability clause",
      "General provisions section has fewer than 5 clauses",
    ],
  },

  // ─── LANGUAGE QUALITY CHECKS (4 queries) ─────────────────────────────────
  // Tests that the draft is readable, precise, and appropriate for the agent.

  {
    id: "PT-13",
    label: "Language — Petra (Cassius mode) uses formal legal language",
    type: "dpa",
    input: {
      agreement_type:       "dpa",
      agreement_type_label: "Data Processing Agreement (DPA)",
      provider_name:        "Provider Co.",
      customer_name:        "Client Co.",
      jurisdictions:        ["EU"],
      context:              "",
      agent:                "cassius",
    },
    expected: {
      formalLanguage:  true,
      mustHaveClauses: ["shall", "hereby", "thereto", "herein"],
      noPlaceholders:  true,
      minSections:     6,
      minClauses:      12,
    },
    redFlags: [
      "Uses casual language like 'will' instead of 'shall' throughout",
      "Missing formal recitals or whereas clauses",
      "Clause text reads like a summary rather than a legal obligation",
    ],
  },

  {
    id: "PT-14",
    label: "Language — Petra (Nora mode) plain language accessible",
    type: "dpa",
    input: {
      agreement_type:       "dpa",
      agreement_type_label: "Data Processing Agreement (DPA)",
      provider_name:        "Provider Co.",
      customer_name:        "Client Co.",
      jurisdictions:        ["EU"],
      context:              "",
      agent:                "nora",
    },
    expected: {
      plainLanguage:   true,
      mustHaveClauses: ["personal data", "security", "deletion", "sub-processor"],
      noPlaceholders:  true,
      minSections:     5,
      minClauses:      10,
    },
    redFlags: [
      "Response is indistinguishable from Cassius mode — no plain language difference",
      "Uses unexplained legal jargon without plain English equivalent",
      "Clause text is inaccessible to a non-lawyer without simplification",
    ],
  },

  {
    id: "PT-15",
    label: "Language — clause titles are descriptive not generic",
    type: "isa",
    input: {
      agreement_type:       "isa",
      agreement_type_label: "Information Security Addendum (ISA)",
      provider_name:        "SecureCo.",
      customer_name:        "Client Inc.",
      jurisdictions:        ["UK"],
      context:              "",
    },
    expected: {
      descriptiveTitles: true,
      mustHaveSections:  ["Security Programme", "Incident Response", "Audit"],
      noPlaceholders:    true,
      minSections:       4,
      minClauses:        10,
    },
    redFlags: [
      "Clause titles are just numbers with no descriptive text",
      "Multiple clauses share the same title",
      "Clause titles are too vague (e.g. 'General', 'Other', 'Miscellaneous')",
    ],
  },

  {
    id: "PT-16",
    label: "Language — summary is plain English, non-technical",
    type: "msa",
    input: {
      agreement_type:       "msa",
      agreement_type_label: "Master Services Agreement (MSA)",
      provider_name:        "Tech Inc.",
      customer_name:        "Retail Co.",
      jurisdictions:        ["US Federal"],
      context:              "E-commerce analytics SaaS",
    },
    expected: {
      summaryQuality:  true,
      mustHaveClauses: [],
      minSections:     6,
      minClauses:      15,
    },
    redFlags: [
      "Summary contains legal jargon not explained in plain terms",
      "Summary is more than 5 sentences",
      "Summary does not mention the agreement type or core purpose",
      "Summary references specific article numbers",
    ],
  },

  // ─── EDGE CASES (4 queries) ───────────────────────────────────────────────

  {
    id: "PT-17",
    label: "Edge — Privacy Policy, consumer-facing language",
    type: "privacy",
    input: {
      agreement_type:       "privacy",
      agreement_type_label: "Privacy Policy",
      provider_name:        "AppCo",
      customer_name:        "End Users",
      jurisdictions:        ["EU", "US Federal"],
      context:              "Consumer mobile app collecting location and health data",
    },
    expected: {
      mustHaveSections:   ["What We Collect", "How We Use Data", "Legal Basis", "Data Sharing", "Your Rights", "Contact"],
      mustHaveClauses:    ["location", "health", "consent", "right to erasure", "contact", "cookies"],
      mustCiteFrameworks: ["GDPR", "ePrivacy", "CCPA"],
      minSections:        6,
      minClauses:         12,
      mustHaveDraftingNotes: true,
    },
    redFlags: [
      "Privacy policy reads like a contract not a user-facing document",
      "Does not include user rights section",
      "Does not address cookies for an app collecting health and location data",
      "Does not cite CCPA for US users",
    ],
  },

  {
    id: "PT-18",
    label: "Edge — Data Sharing Agreement, research context",
    type: "data_share",
    input: {
      agreement_type:       "data_share",
      agreement_type_label: "Data Sharing Agreement",
      provider_name:        "University Medical Centre",
      customer_name:        "Pharma Research Ltd.",
      jurisdictions:        ["UK", "EU"],
      context:              "Anonymised patient data shared for medical research",
    },
    expected: {
      mustHaveSections:   ["Definitions", "Data Scope", "Permitted Use", "Security", "Publication", "Term"],
      mustHaveClauses:    ["anonymised", "research purpose", "publication", "security", "deletion", "re-identification"],
      mustCiteFrameworks: ["GDPR", "UK GDPR"],
      minSections:        5,
      minClauses:         10,
      mustHaveDraftingNotes: true,
    },
    redFlags: [
      "Does not address re-identification risk for anonymised data",
      "Does not include publication/IP provisions for research output",
      "Does not restrict use to stated research purpose",
    ],
  },

  {
    id: "PT-19",
    label: "Edge — SaaS Agreement with biometric features",
    type: "saas",
    input: {
      agreement_type:       "saas",
      agreement_type_label: "SaaS / Subscription Agreement",
      provider_name:        "BiometricSaaS Inc.",
      customer_name:        "HR Solutions Corp.",
      jurisdictions:        ["US Federal", "US State (California)"],
      context:              "SaaS workforce management platform using facial recognition for attendance in Illinois and California",
    },
    expected: {
      mustHaveSections:   ["Definitions", "Services", "Data Protection", "Security", "Liability"],
      mustHaveClauses:    ["biometric", "facial recognition", "consent", "retention", "deletion"],
      mustCiteFrameworks: ["BIPA", "CCPA"],
      minSections:        5,
      minClauses:         12,
      mustHaveDraftingNotes: true,
    },
    redFlags: [
      "Does not flag BIPA obligations for Illinois biometric data",
      "Does not include biometric-specific consent and deletion requirements",
      "Does not cite CCPA for California users",
    ],
  },

  {
    id: "PT-20",
    label: "Edge — short context, structure quality",
    type: "nda",
    input: {
      agreement_type:       "nda",
      agreement_type_label: "Non-Disclosure Agreement (NDA)",
      provider_name:        "Company A",
      customer_name:        "Company B",
      jurisdictions:        [],
      context:              "",
    },
    expected: {
      mustHaveSections:  ["Definitions", "Confidential Information", "Obligations", "Exceptions", "Term"],
      noPlaceholders:    true,
      minSections:       4,
      minClauses:        6,
      mustHaveDraftingNotes: false,
    },
    redFlags: [
      "Refuses to draft with minimal context",
      "Returns fewer than 4 sections for an NDA",
      "Placeholder text instead of real clause language",
      "Does not include standard confidentiality exceptions even when context is minimal",
    ],
  },
];

export default DRAFT_QUERIES;
