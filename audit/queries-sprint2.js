// Norvar — Sprint 2: Context Inference Audit
// 20 test queries across inference confidence levels and edge cases
// Tests /api/infer — domain, jurisdiction, data_types, sector detection

export const INFER_QUERIES = [

  // ─── CONFIDENT INFERENCE (6 queries) ─────────────────────────────────────
  // All four dimensions clearly stated or strongly implied. Should return "high" on all.

  {
    id: "CI-01",
    label: "Confident — GDPR hiring AI, EU",
    type: "confident",
    input: "We are building an AI tool that screens job applicants and ranks them by suitability. We operate in Germany and France.",
    expected: {
      domains:       { values: ["privacy", "ai"], confidence: "high" },
      jurisdictions: { values: ["eu"],            confidence: "high" },
      data_types:    { values: ["behavioural"],   confidence: "high" },
      sector:        { values: ["hr_recruitment"],confidence: "high" },
    },
    redFlags: [
      "Misses ai domain for an AI screening tool",
      "Misses privacy domain for personal data processing",
      "Returns us_federal instead of eu for Germany/France",
      "Misses behavioural data type for applicant profiling",
    ],
  },

  {
    id: "CI-02",
    label: "Confident — US health app",
    type: "confident",
    input: "Our iOS app lets patients in the United States track chronic conditions, log medications, and share data with their doctors.",
    expected: {
      domains:       { values: ["privacy"],       confidence: "high" },
      jurisdictions: { values: ["us_federal"],    confidence: "high" },
      data_types:    { values: ["health"],        confidence: "high" },
      sector:        { values: ["healthcare"],    confidence: "high" },
    },
    redFlags: [
      "Misses health data type",
      "Returns eu jurisdiction for a US-only app",
      "Misses healthcare sector",
      "Does not flag HIPAA-relevant jurisdiction",
    ],
  },

  {
    id: "CI-03",
    label: "Confident — UK fintech credit scoring",
    type: "confident",
    input: "We provide algorithmic credit scoring to UK banks. Our model uses transaction history and behavioural signals to approve or decline loan applications.",
    expected: {
      domains:       { values: ["privacy", "ai"], confidence: "high" },
      jurisdictions: { values: ["uk"],            confidence: "high" },
      data_types:    { values: ["financial", "behavioural"], confidence: "high" },
      sector:        { values: ["finance"],       confidence: "high" },
    },
    redFlags: [
      "Misses ai domain for algorithmic decisioning",
      "Returns eu instead of uk post-Brexit",
      "Misses financial data type",
      "Misses behavioural data type for transaction signals",
    ],
  },

  {
    id: "CI-04",
    label: "Confident — children's education platform, US",
    type: "confident",
    input: "We run an online learning platform for K-12 students in the United States. We collect names, grades, usage data, and video recordings of tutoring sessions.",
    expected: {
      domains:       { values: ["privacy"],          confidence: "high" },
      jurisdictions: { values: ["us_federal", "us_state"], confidence: "high" },
      data_types:    { values: ["children", "general_pi"], confidence: "high" },
      sector:        { values: ["education"],         confidence: "high" },
    },
    redFlags: [
      "Misses children data type — COPPA trigger",
      "Misses education sector",
      "Does not flag us_state alongside us_federal (FERPA + state laws)",
    ],
  },

  {
    id: "CI-05",
    label: "Confident — EU smart city surveillance",
    type: "confident",
    input: "Our computer vision platform processes CCTV footage across public spaces in Amsterdam and Brussels to monitor crowd density and detect incidents in real time.",
    expected: {
      domains:       { values: ["privacy", "ai", "cyber"], confidence: "high" },
      jurisdictions: { values: ["eu"],                     confidence: "high" },
      data_types:    { values: ["biometric", "location"],  confidence: "high" },
      sector:        { values: ["government"],             confidence: "high" },
    },
    redFlags: [
      "Misses biometric data type for CCTV facial data",
      "Misses ai domain for computer vision processing",
      "Misses cyber domain for network-connected cameras",
      "Returns us_federal for Amsterdam and Brussels",
    ],
  },

  {
    id: "CI-06",
    label: "Confident — Canadian proptech, location data",
    type: "confident",
    input: "We are a Canadian real estate app that tracks users' location to recommend nearby properties and stores their search history and home visit data.",
    expected: {
      domains:       { values: ["privacy"],        confidence: "high" },
      jurisdictions: { values: ["canada"],         confidence: "high" },
      data_types:    { values: ["location", "general_pi"], confidence: "high" },
      sector:        { values: ["proptech"],       confidence: "high" },
    },
    redFlags: [
      "Misses location data type",
      "Returns us_federal for a Canadian app",
      "Misses proptech sector",
    ],
  },

  // ─── PARTIAL INFERENCE (6 queries) ────────────────────────────────────────
  // Some dimensions clear, others ambiguous. Should return "medium" on unclear dims.

  {
    id: "PI-01",
    label: "Partial — sector unclear",
    type: "partial",
    input: "We process personal data of employees including performance reviews, salary information, and biometric clock-in data. We have offices in London and New York.",
    expected: {
      domains:       { values: ["privacy", "cyber"], confidence: "high" },
      jurisdictions: { values: ["uk", "us_federal"], confidence: "high" },
      data_types:    { values: ["biometric", "financial", "general_pi"], confidence: "high" },
      sector:        { values: [],                   confidence: "medium" },
    },
    notes: "Sector is unknown — could be any industry. Should be medium confidence, not fabricated.",
    redFlags: [
      "Fabricates a specific sector with high confidence",
      "Misses biometric data type for clock-in data",
      "Misses uk jurisdiction for London offices",
    ],
  },

  {
    id: "PI-02",
    label: "Partial — jurisdiction ambiguous (global users)",
    type: "partial",
    input: "Our SaaS analytics platform collects usage data, IP addresses, and device identifiers from enterprise customers globally.",
    expected: {
      domains:       { values: ["privacy", "cyber"], confidence: "high" },
      jurisdictions: { values: ["eu", "us_federal"], confidence: "medium" },
      data_types:    { values: ["general_pi"],        confidence: "high" },
      sector:        { values: ["technology"],        confidence: "high" },
    },
    notes: "Global users means multiple jurisdictions likely — eu + us_federal as baseline is correct but medium confidence.",
    redFlags: [
      "Returns a single jurisdiction with high confidence for a global product",
      "Misses eu as a baseline for global products",
      "Returns low confidence — should be medium, not low",
    ],
  },

  {
    id: "PI-03",
    label: "Partial — data types partially clear",
    type: "partial",
    input: "We build a fraud detection system for e-commerce merchants in the EU that analyses transaction patterns and user behaviour to flag suspicious activity.",
    expected: {
      domains:       { values: ["privacy", "ai"],          confidence: "high" },
      jurisdictions: { values: ["eu"],                     confidence: "high" },
      data_types:    { values: ["financial", "behavioural"], confidence: "medium" },
      sector:        { values: ["retail", "finance"],      confidence: "medium" },
    },
    notes: "Transaction patterns imply financial + behavioural but not explicit. Sector is retail or finance — both reasonable.",
    redFlags: [
      "Returns high confidence on data types without explicit confirmation",
      "Misses ai domain for fraud detection ML system",
    ],
  },

  {
    id: "PI-04",
    label: "Partial — AI domain implied not stated",
    type: "partial",
    input: "Our platform helps legal firms review contracts by automatically highlighting relevant clauses and suggesting edits.",
    expected: {
      domains:       { values: ["privacy", "ai"],  confidence: "medium" },
      jurisdictions: { values: [],                  confidence: "low" },
      data_types:    { values: ["general_pi"],      confidence: "medium" },
      sector:        { values: ["legal"],           confidence: "high" },
    },
    notes: "AI is implied by automatic clause highlighting. No jurisdiction stated. Data types unclear — contracts may or may not have personal data.",
    redFlags: [
      "Misses ai domain for automated clause review",
      "Returns a jurisdiction with high confidence when none is stated",
      "Returns low confidence on sector — legal is clearly stated",
    ],
  },

  {
    id: "PI-05",
    label: "Partial — multi-jurisdiction product",
    type: "partial",
    input: "We are a US-headquartered company but our users are primarily in Brazil and Mexico. We collect email, age, and purchase history.",
    expected: {
      domains:       { values: ["privacy"],                        confidence: "high" },
      jurisdictions: { values: ["latam", "us_federal"],           confidence: "medium" },
      data_types:    { values: ["general_pi", "financial"],       confidence: "high" },
      sector:        { values: [],                                  confidence: "low" },
    },
    notes: "US HQ + LATAM users. Should flag both. No sector mentioned.",
    redFlags: [
      "Returns only us_federal and ignores Brazil (LGPD) / Mexico",
      "Returns high confidence on jurisdiction without noting LATAM complexity",
      "Fabricates sector",
    ],
  },

  {
    id: "PI-06",
    label: "Partial — cybersecurity implied by architecture",
    type: "partial",
    input: "We are building an API gateway that sits in front of our clients' healthcare systems, managing authentication tokens and routing requests.",
    expected: {
      domains:       { values: ["cyber", "privacy"], confidence: "high" },
      jurisdictions: { values: [],                    confidence: "low" },
      data_types:    { values: ["health"],            confidence: "medium" },
      sector:        { values: ["healthcare"],        confidence: "high" },
    },
    notes: "API gateway for healthcare = cyber + privacy. Health data medium confidence (implied by healthcare context).",
    redFlags: [
      "Misses cyber domain for an API gateway handling auth tokens",
      "Misses privacy domain for healthcare data routing",
      "Returns high confidence on jurisdiction when none is stated",
    ],
  },

  // ─── VAGUE / LOW CONFIDENCE (4 queries) ───────────────────────────────────
  // Minimal information. Should return low confidence and flag what's missing.

  {
    id: "LC-01",
    label: "Vague — no jurisdiction or data details",
    type: "low_confidence",
    input: "We are building a new product that uses machine learning.",
    expected: {
      domains:       { values: ["ai"],  confidence: "medium" },
      jurisdictions: { values: [],      confidence: "low" },
      data_types:    { values: [],      confidence: "low" },
      sector:        { values: [],      confidence: "low" },
    },
    notes: "Almost nothing to go on. AI domain is the only clear signal. Everything else should be low.",
    redFlags: [
      "Returns high confidence on any dimension from this description",
      "Fabricates jurisdiction, data types, or sector",
      "Does not flag what information is missing",
    ],
  },

  {
    id: "LC-02",
    label: "Vague — no personal data mentioned",
    type: "low_confidence",
    input: "We need a compliance assessment for our new internal tool.",
    expected: {
      domains:       { values: [],  confidence: "low" },
      jurisdictions: { values: [],  confidence: "low" },
      data_types:    { values: [],  confidence: "low" },
      sector:        { values: [],  confidence: "low" },
    },
    notes: "Completely uninformative. All dimensions should be low confidence with empty values.",
    redFlags: [
      "Returns any values with medium or high confidence",
      "Does not return all-low confidence",
    ],
  },

  {
    id: "LC-03",
    label: "Vague — sector hinted but nothing else",
    type: "low_confidence",
    input: "We run a hospital network and want to check our compliance posture.",
    expected: {
      domains:       { values: ["privacy"],    confidence: "medium" },
      jurisdictions: { values: [],             confidence: "low" },
      data_types:    { values: ["health"],     confidence: "medium" },
      sector:        { values: ["healthcare"], confidence: "high" },
    },
    notes: "Hospital = healthcare sector (high). Privacy + health data strongly implied (medium). No jurisdiction info at all.",
    redFlags: [
      "Returns jurisdiction with any confidence — none is stated",
      "Misses healthcare sector",
      "Returns low on sector — healthcare is clearly implied by hospital",
    ],
  },

  {
    id: "LC-04",
    label: "Vague — only location mentioned",
    type: "low_confidence",
    input: "Our company is based in Singapore and we want to assess our data practices.",
    expected: {
      domains:       { values: ["privacy"],  confidence: "medium" },
      jurisdictions: { values: ["apac"],     confidence: "high" },
      data_types:    { values: [],           confidence: "low" },
      sector:        { values: [],           confidence: "low" },
    },
    notes: "Singapore = APAC jurisdiction (high). Data practices implies privacy (medium). No data types or sector.",
    redFlags: [
      "Returns us_federal or eu for Singapore",
      "Fabricates data types or sector",
      "Misses privacy domain for a data practices assessment",
    ],
  },

  // ─── MULTI-DIMENSION EDGE CASES (4 queries) ───────────────────────────────
  // Tests nuanced scenarios that trip up inference models.

  {
    id: "EC-01",
    label: "Edge — robotics + public space + EU",
    type: "edge_case",
    input: "We deploy delivery robots on public streets in Paris and Amsterdam. They use cameras to navigate and avoid pedestrians.",
    expected: {
      domains:       { values: ["privacy", "ai", "cyber"], confidence: "high" },
      jurisdictions: { values: ["eu"],                     confidence: "high" },
      data_types:    { values: ["biometric", "location"],  confidence: "high" },
      sector:        { values: ["transport"],              confidence: "high" },
    },
    redFlags: [
      "Misses biometric data type for pedestrian camera detection",
      "Misses ai domain for autonomous navigation",
      "Misses cyber domain for connected robot attack surface",
      "Returns wrong jurisdiction for Paris and Amsterdam",
      "Misses transport sector",
    ],
  },

  {
    id: "EC-02",
    label: "Edge — B2B tool, no direct consumer data",
    type: "edge_case",
    input: "We sell a SaaS dashboard to HR teams that aggregates employee engagement survey results from their own staff.",
    expected: {
      domains:       { values: ["privacy"],        confidence: "high" },
      jurisdictions: { values: [],                  confidence: "low" },
      data_types:    { values: ["general_pi"],      confidence: "high" },
      sector:        { values: ["hr_recruitment"],  confidence: "high" },
    },
    notes: "B2B SaaS — Norvar is a processor not controller. Still privacy obligations. No jurisdiction from description.",
    redFlags: [
      "Misses privacy domain because it is B2B",
      "Returns high confidence on jurisdiction when none is stated",
      "Misses hr_recruitment sector",
    ],
  },

  {
    id: "EC-03",
    label: "Edge — communications data + MENA",
    type: "edge_case",
    input: "We operate a messaging app in Saudi Arabia and the UAE with end-to-end encryption for business communications.",
    expected: {
      domains:       { values: ["privacy", "cyber"], confidence: "high" },
      jurisdictions: { values: ["mena"],             confidence: "high" },
      data_types:    { values: ["communications"],   confidence: "high" },
      sector:        { values: ["technology"],       confidence: "high" },
    },
    redFlags: [
      "Returns eu or us_federal for Saudi Arabia / UAE",
      "Misses communications data type for a messaging app",
      "Misses cyber domain for end-to-end encryption",
      "Does not return mena jurisdiction",
    ],
  },

  {
    id: "EC-04",
    label: "Edge — no AI but reads like AI",
    type: "edge_case",
    input: "Our software uses rule-based filters and keyword matching to flag policy violations in employee emails.",
    expected: {
      domains:       { values: ["privacy", "cyber"], confidence: "high" },
      jurisdictions: { values: [],                    confidence: "low" },
      data_types:    { values: ["communications"],   confidence: "high" },
      sector:        { values: [],                    confidence: "low" },
    },
    notes: "Rule-based is NOT AI — should NOT flag ai domain. This is a hallucination trap.",
    redFlags: [
      "Incorrectly flags ai domain for a rule-based system",
      "Returns high confidence on jurisdiction when none is stated",
      "Misses communications data type for email monitoring",
    ],
  },

];

export default INFER_QUERIES;
