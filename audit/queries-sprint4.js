// Norvar — Sprint 4: Risk Tier Accuracy Audit
// 20 assessment scenarios with known expected risk tiers
// Tests /api/assess — does Cassius return the correct tier based on actual gaps?
// Validates: overall tier, per-domain tier, tier-gap consistency

export const TIER_QUERIES = [

  // ─── EXPECTED: HIGH (4 queries) ──────────────────────────────────────────────
  // Deployments with clear prohibited or high-severity gaps.
  // Must return high overall. No exceptions.

  {
    id: "RT-C01",
    label: "Critical — real-time facial recognition in EU public spaces",
    type: "high",
    description: "We deploy a facial recognition system across train stations and shopping centres in Germany and France to identify persons of interest from a watchlist. The system operates in real time on live CCTV feeds.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high"],
        ai_governance: ["high"],
        cybersecurity: ["high", "medium"],
      },
      mustFlagFrameworks: ["EU AI Act", "GDPR"],
      mustFlagConcepts:   ["prohibited", "real-time biometric", "Art. 5", "special category"],
      minGaps: 3,
    },
    redFlags: [
      "Returns medium or low overall tier for a prohibited AI use case",
      "Does not flag EU AI Act Art. 5 prohibition on real-time biometric surveillance",
      "Does not flag GDPR special category processing",
      "Returns low on AI Governance domain for facial recognition in public spaces",
    ],
  },

  {
    id: "RT-C02",
    label: "Critical — unencrypted health data breach, no notification",
    type: "high",
    description: "Our healthcare SaaS platform stores patient records, diagnostic data, and prescription history for 200,000 patients across the EU and US. We discovered a breach 6 weeks ago affecting all patient records. We have not notified regulators or patients. Data was stored unencrypted.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high"],
        ai_governance: ["low", "medium"],
        cybersecurity: ["high"],
      },
      mustFlagFrameworks: ["GDPR", "HIPAA"],
      mustFlagConcepts:   ["breach notification", "72 hours", "unencrypted", "special category", "health data"],
      minGaps: 4,
    },
    redFlags: [
      "Does not return high for a 6-week unreported breach",
      "Does not flag GDPR 72-hour notification violation",
      "Does not flag HIPAA breach notification failure",
      "Returns medium tier for unencrypted health data exposure",
    ],
  },

  {
    id: "RT-C03",
    label: "Critical — children's data sold to advertisers, no consent",
    type: "high",
    description: "Our mobile gaming app is used by children aged 6-13 in the US and EU. We sell behavioural profiles, location data, and in-app purchase history to advertising networks. We have no parental consent mechanism and no age verification.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high"],
        ai_governance: ["high", "medium"],
        cybersecurity: ["medium"],
      },
      mustFlagFrameworks: ["COPPA", "GDPR", "EU AI Act"],
      mustFlagConcepts:   ["children", "parental consent", "age verification", "sensitive data", "behavioural profiling"],
      minGaps: 4,
    },
    redFlags: [
      "Does not return high for selling children's data without consent",
      "Does not flag COPPA violation",
      "Does not flag GDPR Art. 8 children's consent requirements",
      "Returns low or medium for children's data sold to advertisers",
    ],
  },

  {
    id: "RT-C04",
    label: "Critical — autonomous weapons targeting system",
    type: "high",
    description: "We are building an AI system that autonomously selects and engages targets in military operations without human confirmation of each individual strike. The system uses computer vision to identify targets from drone feeds.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high", "medium"],
        ai_governance: ["high"],
        cybersecurity: ["high"],
      },
      mustFlagFrameworks: ["EU AI Act"],
      mustFlagConcepts:   ["prohibited", "human oversight", "autonomous", "safety-critical", "lethal"],
      minGaps: 3,
    },
    redFlags: [
      "Does not return high for autonomous lethal targeting without human oversight",
      "Does not flag EU AI Act prohibited AI category",
      "Returns medium tier for fully autonomous weapons system",
    ],
  },

  // ─── EXPECTED: HIGH (5 queries) ───────────────────────────────────────────
  // Serious gaps present but no outright prohibited practices.
  // Must return high. Must NOT return high or drop to medium.

  {
    id: "RT-H01",
    label: "High — AI hiring tool, EU, no transparency or bias audit",
    type: "high",
    description: "We use an AI model to screen and rank job applicants across our EU operations. The model was trained on 5 years of historical hiring data. We have no bias audit, no candidate notification, no human review process, and no documentation of the model's decision logic.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high", "medium"],
        ai_governance: ["high"],
        cybersecurity: ["low", "medium"],
      },
      mustFlagFrameworks: ["EU AI Act", "GDPR", "GDPR Art. 22"],
      mustFlagConcepts:   ["high-risk AI", "human oversight", "transparency", "bias", "automated decision"],
      minGaps: 3,
    },
    redFlags: [
      "Returns high — no prohibited practice present",
      "Returns medium or lower for a high-risk AI hiring system with no oversight",
      "Does not flag EU AI Act high-risk classification",
      "Does not flag GDPR Art. 22 automated decision-making",
    ],
  },

  {
    id: "RT-H02",
    label: "High — fintech processing financial data, no DPAs with vendors",
    type: "high",
    description: "We operate a lending platform in the UK processing financial data for 50,000 customers. We use 8 third-party data processors including a US-based cloud provider and a credit bureau. None of our vendor contracts include data processing agreements. We have no breach response plan.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high"],
        ai_governance: ["low"],
        cybersecurity: ["high", "medium"],
      },
      mustFlagFrameworks: ["UK GDPR", "ISO 27001"],
      mustFlagConcepts:   ["data processing agreement", "third party", "breach response", "financial data", "processor"],
      minGaps: 3,
    },
    redFlags: [
      "Returns high — serious but not prohibited",
      "Returns medium for missing DPAs across 8 vendors handling financial data",
      "Does not flag UK GDPR Art. 28 DPA requirement",
    ],
  },

  {
    id: "RT-H03",
    label: "High — cross-border health data transfer, no mechanism",
    type: "high",
    description: "We are a health analytics company transferring EU patient data to our processing servers in the United States. We have no Standard Contractual Clauses, no adequacy decision reliance, and no Transfer Impact Assessment. The data includes diagnosis codes and medication history.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high"],
        ai_governance: ["low"],
        cybersecurity: ["medium"],
      },
      mustFlagFrameworks: ["GDPR", "SCCs"],
      mustFlagConcepts:   ["transfer mechanism", "Chapter V", "adequacy", "SCC", "health data", "special category"],
      minGaps: 3,
    },
    redFlags: [
      "Returns medium for unlawful health data transfer to the US",
      "Does not flag GDPR Chapter V transfer violation",
      "Does not flag health data as special category requiring extra protection",
    ],
  },

  {
    id: "RT-H04",
    label: "High — IoT device collecting location data, no security baseline",
    type: "high",
    description: "We manufacture smart home devices sold across the EU that continuously collect household occupancy patterns, location data, and voice commands. Our devices ship with default admin passwords that cannot be changed. We have no patch management process and no vulnerability disclosure programme.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high", "medium"],
        ai_governance: ["low", "medium"],
        cybersecurity: ["high"],
      },
      mustFlagFrameworks: ["EU Cyber Resilience Act", "GDPR", "NIS2"],
      mustFlagConcepts:   ["default password", "patch management", "location data", "IoT", "vulnerability"],
      minGaps: 3,
    },
    redFlags: [
      "Returns medium for IoT devices with hardcoded default passwords",
      "Does not flag EU Cyber Resilience Act for connected products",
      "Does not flag location data collection as privacy gap",
    ],
  },

  {
    id: "RT-H05",
    label: "High — biometric employee monitoring, no consent, US and UK",
    type: "high",
    description: "We use fingerprint scanners and facial recognition cameras to monitor employee attendance and track movement within our offices in Illinois and London. Employees were not notified and have not consented. We retain biometric data indefinitely.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high"],
        ai_governance: ["high", "medium"],
        cybersecurity: ["medium"],
      },
      mustFlagFrameworks: ["BIPA", "UK GDPR"],
      mustFlagConcepts:   ["biometric", "consent", "retention", "employee", "special category"],
      minGaps: 3,
    },
    redFlags: [
      "Returns medium for unconsented biometric employee monitoring",
      "Does not flag BIPA for Illinois operations",
      "Does not flag UK GDPR special category processing without consent",
      "Does not flag indefinite biometric retention as a gap",
    ],
  },

  // ─── EXPECTED: MEDIUM (5 queries) ─────────────────────────────────────────
  // Compliance gaps exist but manageable. No critical or high severity gaps.
  // Must return medium. Must NOT escalate to high or drop to low.

  {
    id: "RT-M01",
    label: "Medium — privacy notice gaps, US B2C app",
    type: "medium",
    description: "We run a consumer fitness app in the United States with 80,000 users. Our privacy notice does not include a list of third-party data recipients, does not explain our data retention periods, and does not include a contact address for privacy requests. We have no formal data deletion process.",
    expected: {
      overall: "medium",
      domains: {
        privacy:       ["medium"],
        ai_governance: ["low"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: ["CCPA", "FTC Act"],
      mustFlagConcepts:   ["privacy notice", "data retention", "third party disclosure", "deletion request"],
      minGaps: 2,
    },
    redFlags: [
      "Returns high or critical for notice gaps with no data breach or prohibited practice",
      "Returns low — notice gaps are real compliance issues",
      "Does not flag CCPA disclosure requirements",
    ],
  },

  {
    id: "RT-M02",
    label: "Medium — SaaS vendor contracts missing security clauses",
    type: "medium",
    description: "We are a B2B SaaS company providing project management tools. Our customer contracts do not include security obligations, breach notification timelines, or right-to-audit clauses. We have SOC 2 Type I but no Type II. Our incident response plan has not been tested in 18 months.",
    expected: {
      overall: "medium",
      domains: {
        privacy:       ["low", "medium"],
        ai_governance: ["low"],
        cybersecurity: ["medium"],
      },
      mustFlagFrameworks: ["SOC 2", "ISO 27001"],
      mustFlagConcepts:   ["incident response", "contract", "right to audit", "breach notification", "security obligations"],
      minGaps: 2,
    },
    redFlags: [
      "Returns high for untested incident response plan with no active breach",
      "Returns low — missing security contract clauses are real gaps",
      "Does not flag SOC 2 Type I vs Type II distinction",
    ],
  },

  {
    id: "RT-M03",
    label: "Medium — AI chatbot with no disclosure, EU",
    type: "medium",
    description: "We have deployed a customer service chatbot on our e-commerce website in France. The chatbot is AI-powered but users are not informed they are interacting with an AI. It collects name, email, and purchase queries. We have no cookie consent banner.",
    expected: {
      overall: "medium",
      domains: {
        privacy:       ["medium"],
        ai_governance: ["medium"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: ["EU AI Act", "GDPR", "ePrivacy"],
      mustFlagConcepts:   ["AI disclosure", "transparency", "cookie consent", "chatbot", "limited risk AI"],
      minGaps: 2,
    },
    redFlags: [
      "Returns high or critical — chatbot without disclosure is limited-risk not high-risk under EU AI Act",
      "Returns low — AI disclosure and cookie consent are real gaps",
      "Does not flag EU AI Act transparency obligation for AI-powered chatbots",
    ],
  },

  {
    id: "RT-M04",
    label: "Medium — employee monitoring software, notice gap only",
    type: "medium",
    description: "We use productivity monitoring software that tracks application usage and time spent on tasks for remote employees in Canada. Employees were informed monitoring occurs but were not given specific details about what data is collected, how long it is retained, or who can access it.",
    expected: {
      overall: "medium",
      domains: {
        privacy:       ["medium"],
        ai_governance: ["low"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: ["PIPEDA", "Quebec Law 25"],
      mustFlagConcepts:   ["transparency", "employee monitoring", "retention", "notice", "purpose limitation"],
      minGaps: 2,
    },
    redFlags: [
      "Returns high — employees were informed, gap is in detail not existence of notice",
      "Does not flag PIPEDA transparency requirement",
      "Returns high for an incomplete notice without prohibited practice",
    ],
  },

  {
    id: "RT-M05",
    label: "Medium — marketing analytics, tracking without full consent",
    type: "medium",
    description: "We run digital marketing campaigns and use third-party analytics tools, pixel tracking, and retargeting cookies on our website. We have a cookie banner but it defaults to all cookies accepted with no granular opt-out. Users in Germany and Spain are affected.",
    expected: {
      overall: "medium",
      domains: {
        privacy:       ["medium"],
        ai_governance: ["low"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: ["GDPR", "ePrivacy"],
      mustFlagConcepts:   ["cookie consent", "opt-out", "pre-ticked", "tracking", "legitimate interest"],
      minGaps: 2,
    },
    redFlags: [
      "Returns high or critical for a pre-ticked cookie banner",
      "Returns low — pre-ticked consent is a clear GDPR/ePrivacy violation",
      "Does not flag that default-accepted cookies do not constitute valid consent under GDPR",
    ],
  },

  // ─── EXPECTED: LOW (4 queries) ────────────────────────────────────────────
  // Well-documented, low-risk deployments. Should return low.
  // Must NOT escalate to medium, high, or critical.

  {
    id: "RT-L01",
    label: "Low — internal HR tool, anonymised data only",
    type: "low",
    description: "We use an internal dashboard that displays anonymised, aggregated headcount and attrition statistics for our HR team. No individual employee records are accessible. Data is derived from our payroll system after full anonymisation. The tool is hosted internally with no external access.",
    expected: {
      overall: "low",
      domains: {
        privacy:       ["low"],
        ai_governance: ["low"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: [],
      mustFlagConcepts:   [],
      minGaps: 0,
      maxGaps: 1,
    },
    redFlags: [
      "Returns medium or higher for a tool processing only anonymised aggregated data",
      "Flags GDPR obligations for anonymised data (GDPR does not apply to truly anonymous data)",
      "Invents gaps for a low-risk internal tool",
    ],
  },

  {
    id: "RT-L02",
    label: "Low — B2B API with no personal data",
    type: "low",
    description: "We provide a weather data API to enterprise customers. The API returns historical and forecast weather data for geographic coordinates. We do not collect, process, or store any personal data. Authentication uses API keys only. Customers agree to our terms of service before access.",
    expected: {
      overall: "low",
      domains: {
        privacy:       ["low"],
        ai_governance: ["low"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: [],
      mustFlagConcepts:   [],
      minGaps: 0,
      maxGaps: 1,
    },
    redFlags: [
      "Returns medium or higher for an API with no personal data",
      "Invents GDPR obligations for a service with no personal data processing",
      "Returns high cybersecurity tier for basic API key authentication on a non-sensitive service",
    ],
  },

  {
    id: "RT-L03",
    label: "Low — internal document management, EU, staff only",
    type: "low",
    description: "We use an internal document management system for storing company policies, procedures, and operational documents. The system is used exclusively by our 40 employees in the Netherlands. Documents do not contain customer personal data. Access is role-based with MFA enabled.",
    expected: {
      overall: "low",
      domains: {
        privacy:       ["low"],
        ai_governance: ["low"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: [],
      mustFlagConcepts:   [],
      minGaps: 0,
      maxGaps: 2,
    },
    redFlags: [
      "Returns medium for a well-configured internal system with no customer data",
      "Escalates to high because of EU jurisdiction alone",
      "Invents significant gaps for a low-risk internal tool",
    ],
  },

  {
    id: "RT-L04",
    label: "Low — open source library, no data collection",
    type: "low",
    description: "We publish an open source JavaScript utility library for date formatting. The library has no network calls, collects no data, stores nothing, and has no user authentication. It is used by developers as a dependency in their own projects.",
    expected: {
      overall: "low",
      domains: {
        privacy:       ["low"],
        ai_governance: ["low"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: [],
      mustFlagConcepts:   [],
      minGaps: 0,
      maxGaps: 1,
    },
    redFlags: [
      "Returns any tier above low for a data-free open source utility",
      "Applies GDPR to a library with no data processing",
      "Invents cybersecurity gaps for a client-side utility with no network activity",
    ],
  },

  // ─── TIER CONSISTENCY CHECKS (2 queries) ──────────────────────────────────
  // Edge cases where the gap mix is complex — tier must be internally consistent.

  {
    id: "RT-X01",
    label: "Consistency — mixed severity gaps, should be high overall",
    type: "consistency",
    description: "We are a logistics company in Singapore processing employee location data via GPS tracking of delivery drivers. We collect real-time location every 30 seconds during working hours. We have no employee notice, no retention policy, and no data processing agreement with our GPS vendor. No breach has occurred.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high"],
        ai_governance: ["low", "medium"],
        cybersecurity: ["medium"],
      },
      mustFlagFrameworks: ["PDPA"],
      mustFlagConcepts:   ["location data", "employee notice", "retention", "processor agreement"],
      minGaps: 2,
    },
    notes: "Multiple high-severity privacy gaps but no prohibited practices and no breach. Should be high overall.",
    redFlags: [
      "Returns high — no prohibited practice, no active breach",
      "Returns medium — multiple unconsented location tracking gaps warrant high",
      "Does not flag PDPA for Singapore operations",
    ],
  },

  {
    id: "RT-X02",
    label: "Consistency — one high gap drives overall tier",
    type: "consistency",
    description: "We run a news website in the EU. Our privacy notice is excellent, we have valid cookie consent, and we use a GDPR-compliant analytics tool. However, we recently integrated a social scoring plugin from a third-party vendor that rates article credibility based on the reader's past behaviour and assigns a trustworthiness score that affects which content they see.",
    expected: {
      overall: "high",
      domains: {
        privacy:       ["high", "medium"],
        ai_governance: ["high"],
        cybersecurity: ["low"],
      },
      mustFlagFrameworks: ["EU AI Act"],
      mustFlagConcepts:   ["social scoring", "prohibited", "Art. 5", "manipulation", "trustworthiness score"],
      minGaps: 1,
    },
    notes: "One high gap (social scoring = prohibited AI under EU AI Act Art. 5) should drive the overall tier to high regardless of how well everything else is handled.",
    redFlags: [
      "Returns medium — social scoring is a prohibited AI practice and must drive high overall tier",
      "Does not flag EU AI Act Art. 5 prohibition on social scoring",
      "Returns medium because other areas are compliant — one high gap must set the overall tier",
    ],
  },

];

export default TIER_QUERIES;
