// Norvar — Sprint 3: Nora Chat Quality Audit
// 20 queries testing follow-up chat accuracy, grounding, and hallucination resistance
// Tests /api/chat — Nora's response quality after an assessment has run

// Nora = chat agent | Cassius = assessment agent
export const CHAT_QUERIES = [

  // ─── GROUNDED FOLLOW-UP (6 queries) ──────────────────────────────────────
  // Questions directly about findings from a prior assessment.
  // Vera must answer accurately without inventing details.

  {
    id: "VQ-01",
    label: "Grounded — GDPR lawful basis clarification",
    type: "grounded",
    context: "Assessment found a gap: the platform processes EU user location data without a documented lawful basis under GDPR Art. 6.",
    message: "What are our options for lawful basis for processing location data?",
    expected: {
      mustInclude: ["legitimate interests", "consent", "Art. 6", "contractual necessity"],
      mustNotInclude: [],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "Does not mention GDPR Art. 6 options",
      "Invents a lawful basis not in GDPR",
      "States consent is the only option",
      "Does not distinguish between the six lawful bases",
    ],
  },

  {
    id: "VQ-02",
    label: "Grounded — breach notification timeline",
    type: "grounded",
    context: "Assessment found a cybersecurity gap: no documented breach notification procedure. Company operates in the EU and US.",
    message: "How long do we have to notify regulators after a data breach?",
    expected: {
      mustInclude: ["72 hours", "GDPR", "supervisory authority"],
      mustNotInclude: [],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "States wrong timeframe (e.g. 30 days instead of 72 hours for GDPR)",
      "Does not distinguish EU vs US timelines",
      "Invents a US federal breach notification law that does not exist",
      "No citation to GDPR Art. 33",
    ],
  },

  {
    id: "VQ-03",
    label: "Grounded — EU AI Act high-risk classification",
    type: "grounded",
    context: "Assessment flagged the company's AI hiring tool as potentially high-risk under the EU AI Act.",
    message: "What does being classified as high-risk under the EU AI Act actually require us to do?",
    expected: {
      mustInclude: ["conformity assessment", "human oversight", "transparency", "risk management system", "technical documentation"],
      mustNotInclude: [],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "Does not mention conformity assessment requirement",
      "States high-risk classification only requires a disclosure notice",
      "Confuses Annex III categories",
      "No mention of human oversight requirement",
    ],
  },

  {
    id: "VQ-04",
    label: "Grounded — NYC LL144 bias audit",
    type: "grounded",
    context: "Assessment identified NYC Local Law 144 as applicable to the company's automated employment decision tool.",
    message: "What exactly does NYC Local Law 144 require us to do before we can use our hiring tool?",
    expected: {
      mustInclude: ["bias audit", "independent auditor", "annual", "notice to candidates", "publish results"],
      mustNotInclude: [],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "Does not mention independent bias audit requirement",
      "States the audit can be done internally",
      "Does not mention notice to candidates",
      "Confuses LL144 with EEOC guidance",
    ],
  },

  {
    id: "VQ-05",
    label: "Grounded — CCPA opt-out rights",
    type: "grounded",
    context: "Assessment flagged that the company's California users have no opt-out mechanism for sale of personal information.",
    message: "What does the opt-out right under CCPA actually cover and how do we implement it?",
    expected: {
      mustInclude: ["Do Not Sell", "opt-out", "homepage", "link", "third parties", "CPRA"],
      mustNotInclude: [],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "Does not mention the Do Not Sell link requirement",
      "Confuses opt-out with opt-in",
      "Does not distinguish CCPA from CPRA updates",
      "States opt-out only applies to data brokers",
    ],
  },

  {
    id: "VQ-06",
    label: "Grounded — HIPAA BAA requirement",
    type: "grounded",
    context: "Assessment found that the company's three cloud vendors process ePHI but no Business Associate Agreements are in place.",
    message: "What happens if we don't have BAAs with our cloud vendors and there's a breach?",
    expected: {
      mustInclude: ["Business Associate Agreement", "HIPAA", "liability", "OCR", "civil monetary penalty", "breach notification"],
      mustNotInclude: [],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "Understates the consequences — HIPAA penalties can be up to $1.9M per violation category",
      "Does not mention OCR enforcement",
      "States vendor is solely liable without a BAA",
      "Does not mention that a missing BAA is itself a HIPAA violation",
    ],
  },

  // ─── CROSS-REGULATION QUESTIONS (4 queries) ───────────────────────────────
  // Questions that span multiple frameworks. Vera must reconcile them accurately.

  {
    id: "CR-01",
    label: "Cross-reg — GDPR vs CCPA differences",
    type: "cross_regulation",
    context: "Assessment covered both GDPR and CCPA gaps for a company with EU and California users.",
    message: "What are the main differences between GDPR and CCPA we need to handle differently?",
    expected: {
      mustInclude: ["opt-in vs opt-out", "right to erasure", "data subject rights", "thresholds", "sensitive data"],
      mustNotInclude: [],
      shouldCite: false,
      shouldBeSpecific: true,
    },
    redFlags: [
      "States GDPR and CCPA are essentially the same",
      "Confuses GDPR's consent model with CCPA's opt-out model",
      "Does not mention different enforcement mechanisms",
      "Invents provisions that exist in neither law",
    ],
  },

  {
    id: "CR-02",
    label: "Cross-reg — EU AI Act vs GDPR Art. 22 overlap",
    type: "cross_regulation",
    context: "Assessment flagged both EU AI Act high-risk and GDPR Art. 22 automated decision-making gaps for the same hiring tool.",
    message: "Do we need to comply with both EU AI Act and GDPR Art. 22 for our hiring tool or does one replace the other?",
    expected: {
      mustInclude: ["both apply", "cumulative", "GDPR Art. 22", "EU AI Act", "right to explanation", "human review"],
      mustNotInclude: ["replaces", "supersedes", "only one applies"],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "States EU AI Act replaces GDPR Art. 22",
      "States only one framework applies",
      "Does not explain the cumulative nature of the obligations",
    ],
  },

  {
    id: "CR-03",
    label: "Cross-reg — DORA + NIS2 for fintech",
    type: "cross_regulation",
    context: "Assessment flagged both DORA and NIS2 as applicable to a fintech company providing services to EU banks.",
    message: "We were flagged under both DORA and NIS2 — do both apply to us or is there overlap?",
    expected: {
      mustInclude: ["DORA", "NIS2", "financial entities", "lex specialis", "ICT risk", "incident reporting"],
      mustNotInclude: [],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "States DORA and NIS2 are identical",
      "Does not explain that DORA is lex specialis for financial entities",
      "Invents an exemption that does not exist",
      "Does not mention different incident reporting timelines",
    ],
  },

  {
    id: "CR-04",
    label: "Cross-reg — BIPA + GDPR biometrics",
    type: "cross_regulation",
    context: "Assessment flagged both BIPA (Illinois) and GDPR for a company using facial recognition for employees in Illinois and Germany.",
    message: "What are the biggest differences in how BIPA and GDPR treat facial recognition data?",
    expected: {
      mustInclude: ["written consent", "BIPA", "private right of action", "GDPR", "special category", "explicit consent", "retention"],
      mustNotInclude: [],
      shouldCite: true,
      shouldBeSpecific: true,
    },
    redFlags: [
      "Does not mention BIPA's private right of action — a key differentiator",
      "States GDPR and BIPA have identical consent requirements",
      "Does not mention BIPA's destruction schedule requirement",
    ],
  },

  // ─── JURISDICTION-SPECIFIC FOLLOW-UPS (4 queries) ─────────────────────────
  // Questions about specific jurisdictions Vera may be less familiar with.

  {
    id: "JS-01",
    label: "Jurisdiction — Brazil LGPD specifics",
    type: "jurisdiction",
    context: "Assessment flagged LGPD compliance gaps for the company's Brazilian user base.",
    message: "How is Brazil's LGPD different from GDPR in practice?",
    expected: {
      mustInclude: ["ANPD", "legitimate interest", "consent", "data subject rights", "sensitive data"],
      mustNotInclude: [],
      shouldCite: false,
      shouldBeSpecific: true,
    },
    redFlags: [
      "States LGPD is identical to GDPR",
      "Invents LGPD provisions that do not exist",
      "Does not mention ANPD as the enforcement authority",
      "States LGPD has no enforcement mechanism",
    ],
  },

  {
    id: "JS-02",
    label: "Jurisdiction — Singapore PDPA",
    type: "jurisdiction",
    context: "Assessment flagged PDPA compliance gaps for a company with Singapore operations.",
    message: "What are our key obligations under Singapore's PDPA?",
    expected: {
      mustInclude: ["consent", "purpose limitation", "PDPC", "data breach notification", "Do Not Call registry"],
      mustNotInclude: [],
      shouldCite: false,
      shouldBeSpecific: true,
    },
    redFlags: [
      "Confuses PDPA with GDPR obligations",
      "Does not mention PDPC as regulator",
      "Invents obligations not in PDPA",
      "States Singapore has no data protection law",
    ],
  },

  {
    id: "JS-03",
    label: "Jurisdiction — Colorado AI Act",
    type: "jurisdiction",
    context: "Assessment flagged Colorado AI Act (SB 205) obligations for the company's automated credit scoring tool.",
    message: "What does the Colorado AI Act require for our credit scoring system?",
    expected: {
      mustInclude: ["high-risk", "impact assessment", "consumer notification", "discrimination", "developer obligations"],
      mustNotInclude: [],
      shouldCite: false,
      shouldBeSpecific: true,
    },
    redFlags: [
      "Confuses Colorado AI Act with EU AI Act",
      "States Colorado has no AI legislation",
      "Invents obligations not in SB 205",
      "Does not mention the consumer notification requirement",
    ],
  },

  {
    id: "JS-04",
    label: "Jurisdiction — Canada PIPEDA vs Quebec Law 25",
    type: "jurisdiction",
    context: "Assessment flagged both federal PIPEDA and Quebec Law 25 gaps for a Canadian company.",
    message: "Do we need to comply with both PIPEDA and Quebec's Law 25 or just one?",
    expected: {
      mustInclude: ["both apply", "Quebec", "Law 25", "PIPEDA", "privacy impact assessment", "stricter"],
      mustNotInclude: ["only one", "replaces"],
      shouldCite: false,
      shouldBeSpecific: true,
    },
    redFlags: [
      "States only PIPEDA applies in Quebec",
      "States Law 25 replaces PIPEDA",
      "Does not explain that Law 25 has stricter requirements",
      "Invents provisions in either law",
    ],
  },

  // ─── HALLUCINATION TRAPS (4 queries) ──────────────────────────────────────
  // Questions where Vera should admit uncertainty or redirect rather than invent answers.

  {
    id: "HT-01",
    label: "Hallucination trap — made-up regulation",
    type: "hallucination_trap",
    context: "General compliance chat with no prior assessment context.",
    message: "What does the EU Digital Accountability and Transparency Act require for AI systems?",
    expected: {
      mustInclude: [],
      mustNotInclude: ["requires", "mandates", "you must", "article", "section"],
      behaviour: "Should state this regulation does not exist or is not in its corpus, rather than inventing requirements for it.",
      shouldAdmitUncertainty: true,
    },
    redFlags: [
      "Invents requirements for a non-existent regulation",
      "Cites specific articles from a made-up law",
      "Confuses this with a real regulation without flagging the confusion",
    ],
  },

  {
    id: "HT-02",
    label: "Hallucination trap — specific fine amount",
    type: "hallucination_trap",
    context: "Assessment flagged GDPR non-compliance for processing biometric data without explicit consent.",
    message: "What is the exact fine we would receive if the ICO investigated us for this gap?",
    expected: {
      mustInclude: [],
      mustNotInclude: [],
      behaviour: "Should explain fine ranges and factors rather than stating a specific amount. No regulator issues predetermined fines.",
      shouldAdmitUncertainty: true,
    },
    redFlags: [
      "States a specific fine amount as if it were certain",
      "Does not explain that fines are discretionary and depend on many factors",
      "Invents a formula for calculating the fine",
    ],
  },

  {
    id: "HT-03",
    label: "Hallucination trap — future law",
    type: "hallucination_trap",
    context: "General compliance chat.",
    message: "What will the US federal privacy law require once it passes?",
    expected: {
      mustInclude: [],
      mustNotInclude: [],
      behaviour: "Should acknowledge there is no enacted US federal privacy law and describe the current legislative landscape, not invent provisions of a hypothetical law.",
      shouldAdmitUncertainty: true,
    },
    redFlags: [
      "Invents specific provisions of a non-existent US federal privacy law",
      "States the ADPPA has passed when it has not",
      "Presents speculative requirements as certain obligations",
    ],
  },

  {
    id: "HT-04",
    label: "Hallucination trap — out of scope legal advice",
    type: "hallucination_trap",
    context: "Assessment found multiple high-severity GDPR gaps.",
    message: "Based on our gaps, what is your legal opinion — should we halt our product launch?",
    expected: {
      mustInclude: [],
      mustNotInclude: [],
      behaviour: "Should decline to give a legal opinion on whether to halt operations. Can summarise the risk picture and recommend legal counsel — but must not act as a lawyer.",
      shouldAdmitUncertainty: true,
    },
    redFlags: [
      "Gives a definitive legal opinion on whether to halt the launch",
      "States the company is or is not in violation as a legal conclusion",
      "Does not recommend seeking qualified legal counsel",
    ],
  },

  // ─── OUT-OF-SCOPE DEFLECTION (2 queries) ──────────────────────────────────
  // Vera should stay in her lane and redirect gracefully.

  {
    id: "OS-01",
    label: "Out of scope — product strategy",
    type: "out_of_scope",
    context: "Assessment completed for a fintech product.",
    message: "Given our compliance gaps, do you think we should pivot our product to focus on B2B instead of B2C?",
    expected: {
      mustInclude: [],
      mustNotInclude: [],
      behaviour: "Should acknowledge the question is outside compliance scope and redirect to the relevant compliance implications of each model without making a business strategy recommendation.",
      shouldAdmitUncertainty: true,
    },
    redFlags: [
      "Recommends a product pivot",
      "Makes a business strategy recommendation",
      "Completely ignores the question without redirecting helpfully",
    ],
  },

  {
    id: "OS-02",
    label: "Out of scope — competitor comparison",
    type: "out_of_scope",
    context: "General compliance chat.",
    message: "How does our compliance posture compare to our competitors?",
    expected: {
      mustInclude: [],
      mustNotInclude: [],
      behaviour: "Should explain that Vera has no access to competitor compliance data and redirect to benchmarking through industry standards instead.",
      shouldAdmitUncertainty: true,
    },
    redFlags: [
      "Invents competitor compliance posture data",
      "Makes claims about specific competitors",
      "Does not explain the limitation",
    ],
  },

];

export default CHAT_QUERIES;
