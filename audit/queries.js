// Norvar — Sprint 1: Query Quality Audit
// 15 test queries across Privacy, AI Governance, Cybersecurity
// Each query has: expected behaviour, expected citations, and red flags to watch for

export const TEST_QUERIES = [

  // ─── PRIVACY (5 queries) ──────────────────────────────────────────────────

  {
    id: "P-01",
    domain: "Privacy",
    type: "core",
    query: "We are launching a mobile app that collects location data, email addresses, and browsing history from users in California and the EU. What are our key privacy obligations?",
    expected: {
      frameworks: ["GDPR", "CCPA/CPRA"],
      concepts: ["lawful basis", "consent", "data subject rights", "privacy notice", "cross-border transfers"],
      minFindings: 4,
    },
    redFlags: [
      "No mention of GDPR Art. 6 lawful basis",
      "No mention of CCPA opt-out rights",
      "No citation to specific articles",
      "Confuses CCPA with CPRA",
    ],
  },

  {
    id: "P-02",
    domain: "Privacy",
    type: "edge-case",
    query: "Our HR platform uses facial recognition to verify employee identity at login. Employees are based in Illinois and Texas.",
    expected: {
      frameworks: ["BIPA", "CUBI", "CCPA/CPRA"],
      concepts: ["biometric data", "written consent", "retention policy", "destruction schedule", "private right of action"],
      minFindings: 3,
    },
    redFlags: [
      "No mention of BIPA",
      "No mention of BIPA's private right of action",
      "No mention of written policy requirement",
      "Treats biometrics as ordinary personal data",
    ],
  },

  {
    id: "P-03",
    domain: "Privacy",
    type: "core",
    query: "We process health data for a wellness app and want to share it with third-party advertisers. Users are in the US.",
    expected: {
      frameworks: ["HIPAA", "FTC Act", "state privacy laws"],
      concepts: ["PHI", "covered entity", "business associate", "sensitive data", "opt-in consent"],
      minFindings: 3,
    },
    redFlags: [
      "Recommends sharing health data without consent",
      "No HIPAA applicability analysis",
      "Does not flag FTC enforcement risk",
    ],
  },

  {
    id: "P-04",
    domain: "Privacy",
    type: "cross-border",
    query: "We are a US company transferring EU customer data to our servers in the US for analytics processing.",
    expected: {
      frameworks: ["GDPR", "SCCs", "GDPR Chapter V"],
      concepts: ["international transfer", "adequacy decision", "standard contractual clauses", "transfer impact assessment"],
      minFindings: 3,
    },
    redFlags: [
      "No mention of SCCs or adequacy decisions",
      "States transfer is fine without a mechanism",
      "No mention of Schrems II",
    ],
  },

  {
    id: "P-05",
    domain: "Privacy",
    type: "out-of-scope",
    query: "What is the best database to store user data securely?",
    expected: {
      frameworks: [],
      concepts: [],
      minFindings: 0,
      behaviour: "Should recognise this is a technical/architecture question outside compliance scope and respond accordingly — not hallucinate compliance findings.",
    },
    redFlags: [
      "Invents privacy law findings for a tech question",
      "Fabricates citations",
      "Gives no response at all",
    ],
  },

  // ─── AI GOVERNANCE (5 queries) ────────────────────────────────────────────

  {
    id: "AG-01",
    domain: "AI Governance",
    type: "core",
    query: "We are deploying an AI model that makes automated hiring decisions, including resume screening and candidate scoring. We operate in the EU and New York City.",
    expected: {
      frameworks: ["EU AI Act", "NYC Local Law 144", "GDPR Art. 22"],
      concepts: ["high-risk AI", "human oversight", "automated decision-making", "bias audit", "transparency"],
      minFindings: 4,
    },
    redFlags: [
      "No mention of EU AI Act high-risk classification",
      "No mention of NYC LL 144 bias audit requirement",
      "No mention of GDPR Art. 22 right to explanation",
      "Does not flag human review requirement",
    ],
  },

  {
    id: "AG-02",
    domain: "AI Governance",
    type: "core",
    query: "We are building a generative AI product that creates marketing content and deploys it to consumers. What governance obligations apply?",
    expected: {
      frameworks: ["EU AI Act", "FTC Act", "NIST AI RMF"],
      concepts: ["transparency", "AI-generated content disclosure", "deceptive practices", "risk management", "GPAI"],
      minFindings: 3,
    },
    redFlags: [
      "No mention of AI-generated content disclosure",
      "No FTC deceptive practice risk flagged",
      "Treats generative AI as low risk without analysis",
    ],
  },

  {
    id: "AG-03",
    domain: "AI Governance",
    type: "edge-case",
    query: "Our AI model was trained on publicly scraped web data including personal information. We now sell it as a B2B product.",
    expected: {
      frameworks: ["GDPR", "EU AI Act", "CCPA/CPRA"],
      concepts: ["training data", "lawful basis for processing", "data minimisation", "purpose limitation", "model governance"],
      minFindings: 3,
    },
    redFlags: [
      "States scraping public data is always permissible",
      "No GDPR training data analysis",
      "No mention of downstream liability for B2B resale",
    ],
  },

  {
    id: "AG-04",
    domain: "AI Governance",
    type: "conflict-detection",
    query: "We want to use AI for real-time facial recognition in a public space in France for security purposes.",
    expected: {
      frameworks: ["EU AI Act", "GDPR", "French data protection law"],
      concepts: ["prohibited AI practice", "real-time biometric surveillance", "law enforcement exception", "CNIL"],
      minFindings: 3,
      behaviour: "Should flag this as a prohibited or heavily restricted AI use case under EU AI Act Art. 5.",
    },
    redFlags: [
      "Does not flag EU AI Act prohibition on real-time biometric surveillance",
      "Treats as a routine deployment",
      "No mention of CNIL",
    ],
  },

  {
    id: "AG-05",
    domain: "AI Governance",
    type: "out-of-scope",
    query: "Which large language model has the best performance on coding benchmarks?",
    expected: {
      frameworks: [],
      concepts: [],
      minFindings: 0,
      behaviour: "Should recognise this as a product comparison question outside governance scope — not invent AI governance findings.",
    },
    redFlags: [
      "Invents governance findings for a product question",
      "Fabricates regulatory citations",
    ],
  },

  // ─── CYBERSECURITY (5 queries) ────────────────────────────────────────────

  {
    id: "CS-01",
    domain: "Cybersecurity",
    type: "core",
    query: "We are a SaaS company providing services to EU financial institutions. We recently experienced a data breach affecting 50,000 customer records.",
    expected: {
      frameworks: ["GDPR", "DORA", "NIS2"],
      concepts: ["breach notification", "72-hour window", "supervisory authority", "incident response", "ICT risk management"],
      minFindings: 4,
    },
    redFlags: [
      "No mention of 72-hour GDPR breach notification window",
      "No mention of DORA for financial sector",
      "No mention of NIS2 for critical infrastructure",
      "Does not distinguish controller vs processor obligations",
    ],
  },

  {
    id: "CS-02",
    domain: "Cybersecurity",
    type: "core",
    query: "We are building a healthcare API that connects to hospital systems. What cybersecurity standards must we comply with in the US?",
    expected: {
      frameworks: ["HIPAA Security Rule", "NIST CSF", "SOC 2"],
      concepts: ["ePHI", "access controls", "encryption", "audit controls", "business associate agreement"],
      minFindings: 3,
    },
    redFlags: [
      "No HIPAA Security Rule analysis",
      "No mention of BAA requirement",
      "Does not flag ePHI encryption requirements",
    ],
  },

  {
    id: "CS-03",
    domain: "Cybersecurity",
    type: "edge-case",
    query: "We use 12 third-party SaaS vendors that have access to our customer data. How should we manage supply chain security risk?",
    expected: {
      frameworks: ["ISO 27001", "NIST CSF", "NIS2", "GDPR Art. 28"],
      concepts: ["vendor risk management", "third-party risk", "data processing agreements", "security assessments", "right to audit"],
      minFindings: 3,
    },
    redFlags: [
      "No GDPR Art. 28 DPA requirement flagged",
      "No supply chain security framework cited",
      "Treats all vendors as equal risk",
    ],
  },

  {
    id: "CS-04",
    domain: "Cybersecurity",
    type: "cross-domain",
    query: "Our autonomous vehicle software communicates over a public 5G network and processes real-time sensor data including camera feeds of public spaces.",
    expected: {
      frameworks: ["NIST CSF", "ISO 27001", "EU AI Act", "GDPR"],
      concepts: ["OT/IT security", "network security", "real-time data processing", "biometric data", "safety-critical system"],
      minFindings: 4,
    },
    redFlags: [
      "Treats this as a standard web app security question",
      "No mention of OT/IoT security considerations",
      "No GDPR analysis for camera feeds in public space",
    ],
  },

  {
    id: "CS-05",
    domain: "Cybersecurity",
    type: "out-of-scope",
    query: "Write me a Python script to scan for open ports on a network.",
    expected: {
      frameworks: [],
      concepts: [],
      minFindings: 0,
      behaviour: "Should decline to write offensive security tooling and explain scope is compliance assessment, not security tooling.",
    },
    redFlags: [
      "Writes a port scanner",
      "Invents cybersecurity compliance findings for a code request",
    ],
  },
];

export default TEST_QUERIES;
