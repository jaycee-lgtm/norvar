/**
 * NORVAR — Framework Library
 * Adapted from the Norvar.io prototype (frameworkBriefs.ts)
 *
 * Contains metadata, article-level controls, source URLs, and Claude prompt
 * templates for every regulation in Norvar's corpus. Used by:
 *   - The inference engine (system prompt enrichment)
 *   - The results page (framework detail cards)
 *   - The corpus ingestion pipeline (metadata tagging)
 *   - The RAG retrieval layer (filtering and ranking)
 */

export type FrameworkStatus = "in_force" | "advancing" | "upcoming" | "watch";
export type FrameworkDomain =
  | "ai"
  | "privacy"
  | "cyber"
  | "cv"
  | "adm"
  | "robotics"
  | "standards";

export interface FrameworkMeta {
  name:        string;
  abbr:        string;
  domain:      FrameworkDomain;
  jurisdiction: string;
  status:      FrameworkStatus;
  year:        number;
  sourceUrl:   string;
  badge:       string;
  tagline:     string;
  scope:       string;
  triggers:    string;
  obligations: string[];
  enforcement: string;
  norvarNote:  string;
  controls:    string[];
  claudePrompt: string;
}

export const FRAMEWORKS: FrameworkMeta[] = [

  // ── EU — AI ─────────────────────────────────────────────────────────────────

  {
    name:        "EU AI Act",
    abbr:        "EU AI Act",
    domain:      "ai",
    jurisdiction: "EU / EEA",
    status:      "in_force",
    year:        2024,
    sourceUrl:   "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689",
    badge:       "High-risk",
    tagline:     "Horizontal risk-based regulation of AI systems and general-purpose AI models placed on the EU market.",
    scope:       "Providers, deployers, importers and distributors of AI systems used in the EU — regardless of where they are established. Extraterritorial when output is used in the EU.",
    triggers:    "Prohibited practices from Feb 2025. GPAI obligations from Aug 2025. High-risk system rules from Aug 2026. Embedded high-risk products from Aug 2027.",
    obligations: [
      "Classify systems: prohibited (Art. 5), high-risk (Annex III), limited-risk, minimal.",
      "High-risk: risk management (Art. 9), data governance (Art. 10), technical documentation (Art. 11), logging (Art. 12), transparency (Art. 13), human oversight (Art. 14), accuracy and cybersecurity (Art. 15).",
      "Quality management system (Art. 17) and conformity assessment + CE marking (Art. 43).",
      "Post-market monitoring (Art. 72) and serious incident reporting within 15 days (Art. 73).",
      "GPAI providers: technical docs, copyright policy, training data summary. Systemic-risk models add evals, adversarial testing, incident reporting.",
    ],
    enforcement: "Up to €35M or 7% of global turnover for prohibited uses. €15M or 3% for high-risk breaches. €7.5M or 1.5% for incorrect information. Enforced by national market-surveillance authorities and the EU AI Office.",
    norvarNote:  "Norvar maps 11 Articles and Annex III categories to your deployments and surfaces Annex IV technical documentation gaps.",
    controls:    ["Art. 5 Prohibited", "Art. 6 Risk class.", "Art. 9 Risk mgmt", "Art. 10 Data gov.", "Art. 11 Tech doc.", "Art. 12 Logging", "Art. 13 Transparency", "Art. 14 Human oversight", "Art. 15 Accuracy & cyber", "Art. 17 QMS", "Art. 43 Conformity", "Art. 72 Post-market", "Annex III High-risk list"],
    claudePrompt: "Explain the EU AI Act enforcement timeline, high-risk system classifications under Annex III, what conformity assessment obligations apply, and the GPAI provider obligations including for systemic-risk models.",
  },

  // ── EU — Privacy ─────────────────────────────────────────────────────────────

  {
    name:        "General Data Protection Regulation",
    abbr:        "GDPR",
    domain:      "privacy",
    jurisdiction: "EU / EEA",
    status:      "in_force",
    year:        2018,
    sourceUrl:   "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
    badge:       "Active",
    tagline:     "EU regime for processing personal data, with extraterritorial reach for offering goods/services to or monitoring people in the EU.",
    scope:       "Any controller or processor of EU personal data, including AI training, inference and robotics telemetry. Applies to non-EU companies via Art. 3(2).",
    triggers:    "Any processing of personal data — collection, training, profiling (Art. 22), biometric or special-category data (Art. 9), or cross-border transfers (Ch. V).",
    obligations: [
      "Lawful basis (Art. 6) plus additional condition for special category data (Art. 9).",
      "Transparency notices (Art. 13-14), data-subject rights (Art. 15-22) including objection to automated decisions.",
      "Records of processing (Art. 30), security (Art. 32), 72-hour breach notification (Art. 33-34).",
      "DPIA for high-risk processing (Art. 35) — mandatory for biometric AI, large-scale monitoring, scoring.",
      "Art. 28 DPA with every processor. SCCs and transfer impact assessment for non-adequate countries.",
    ],
    enforcement: "Up to €20M or 4% of global turnover. Active enforcement by EU DPAs and EDPB. Class actions enabled under Art. 80.",
    norvarNote:  "Norvar tracks 11 GDPR controls and surfaces DPIA, RoPA entry, and Art. 28 redline gaps per deployment.",
    controls:    ["Art. 5 Principles", "Art. 6 Lawful basis", "Art. 9 Special cat.", "Art. 22 ADM", "Art. 25 PbD", "Art. 28 DPA", "Art. 30 RoPA", "Art. 32 Security", "Art. 33-34 Breach", "Art. 35 DPIA", "Ch. V Transfers"],
    claudePrompt: "Summarise the key GDPR obligations for AI deployments — Art. 28 DPA requirements, Art. 35 DPIA triggers, Art. 9 special category data, Art. 22 automated decision-making rights, and cross-border transfer mechanisms.",
  },

  {
    name:        "ePrivacy Directive",
    abbr:        "ePrivacy",
    domain:      "privacy",
    jurisdiction: "EU / EEA",
    status:      "in_force",
    year:        2009,
    sourceUrl:   "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058",
    badge:       "EU",
    tagline:     "EU rules on confidentiality of electronic communications, cookies and tracking — sits alongside GDPR.",
    scope:       "Anyone storing or accessing information on a user's device or processing comms metadata in the EU. Applies to AI products using cookies, device fingerprints, SDK telemetry or push tokens.",
    triggers:    "Any read/write to terminal equipment (Art. 5(3)), processing of traffic or location data, or sending unsolicited electronic marketing.",
    obligations: [
      "Prior, informed consent before non-essential cookies, SDKs or fingerprinting.",
      "Confidentiality of communications (Art. 5(1)) — no interception without consent or legal basis.",
      "Traffic data (Art. 6) and location data (Art. 9): purpose-limited and consent-based beyond billing.",
      "Direct marketing (Art. 13): opt-in for B2C electronic marketing; soft opt-in for existing customers.",
    ],
    enforcement: "Implemented nationally (PECR in UK, TTDSG in Germany). Fines vary; some regimes import GDPR-level caps.",
    norvarNote:  "Norvar checks consent surfaces, SDK inventories and marketing flows against ePrivacy and national implementations.",
    controls:    ["Art. 5(1) Confidentiality", "Art. 5(3) Cookies", "Art. 6 Traffic data", "Art. 9 Location data", "Art. 13 Direct marketing"],
    claudePrompt: "Explain ePrivacy Directive obligations for AI products — cookies, device fingerprinting, and electronic communications metadata used to train or operate AI systems.",
  },

  {
    name:        "EU Data Act",
    abbr:        "Data Act",
    domain:      "privacy",
    jurisdiction: "EU / EEA",
    status:      "in_force",
    year:        2025,
    sourceUrl:   "https://eur-lex.europa.eu/eli/reg/2023/2854/oj",
    badge:       "EU",
    tagline:     "B2B/B2C/B2G data sharing for connected products and related services; effective September 2025.",
    scope:       "Manufacturers and providers of connected products including industrial robots, IoT sensors, vehicles and related digital services placed on the EU market.",
    triggers:    "Placing a connected product on the market, providing a related service, or offering a cloud or edge data-processing service to EU customers.",
    obligations: [
      "Access-by-design (Art. 3): products must be designed so users can access generated data.",
      "User access on request (Art. 4) and third-party sharing on user instruction (Art. 5).",
      "Fair, reasonable, non-discriminatory B2B data-sharing terms (Art. 8-12); unfair contractual terms void.",
      "B2G access in exceptional need (Ch. V) and cloud-switching and interoperability requirements (Ch. VI).",
    ],
    enforcement: "Member-state authorities. Fines up to GDPR-equivalent levels for personal-data overlap.",
    norvarNote:  "Norvar inventories generated-data flows from connected deployments and identifies access-by-design gaps.",
    controls:    ["Art. 3 Access by design", "Art. 4 User access", "Art. 5 Third-party share", "Art. 8-12 B2B terms", "Ch. V B2G", "Ch. VI Cloud switching"],
    claudePrompt: "Explain the EU Data Act — data sharing obligations for connected products and IoT, B2B and B2G access rules, and cloud switching requirements.",
  },

  // ── EU — Cyber ────────────────────────────────────────────────────────────────

  {
    name:        "NIS2 Directive",
    abbr:        "NIS2",
    domain:      "cyber",
    jurisdiction: "EU / EEA",
    status:      "in_force",
    year:        2024,
    sourceUrl:   "https://eur-lex.europa.eu/eli/dir/2022/2555/oj",
    badge:       "Cyber",
    tagline:     "Expanded EU cybersecurity baseline for essential and important entities across 18 sectors.",
    scope:       "Medium and large entities (and some smaller ones) in sectors including manufacturing, ICT services, digital infrastructure, transport, energy, health. Threshold: 50+ staff or €10M turnover.",
    triggers:    "Meeting sector and size thresholds automatically pulls an entity into scope.",
    obligations: [
      "Management body accountability and mandatory cyber training (Art. 20).",
      "Ten risk-management measures (Art. 21): policies, incident handling, BCP, supply chain, vulnerability disclosure, cryptography, access control, MFA, communications.",
      "Incident reporting: 24-hour early warning, 72-hour notification, 1-month final report (Art. 23).",
      "Registration with the competent authority and supply-chain risk assessments.",
    ],
    enforcement: "Up to €10M or 2% of global turnover for essential entities. €7M or 1.4% for important entities. Personal liability for management.",
    norvarNote:  "Norvar maps your technology estate to the ten Art. 21 measures and tracks the 24/72/30-day reporting deadlines.",
    controls:    ["Art. 20 Governance", "Art. 21 Risk measures", "Art. 23 24h/72h reporting", "Supply chain risk", "Art. 32-33 Supervision"],
    claudePrompt: "Explain NIS2 Directive obligations — scope of essential and important entities, the ten risk management measures under Art. 21, incident reporting timelines, and management body accountability.",
  },

  {
    name:        "Digital Operational Resilience Act",
    abbr:        "DORA",
    domain:      "cyber",
    jurisdiction: "EU / EEA",
    status:      "in_force",
    year:        2025,
    sourceUrl:   "https://eur-lex.europa.eu/eli/reg/2022/2554/oj",
    badge:       "Cyber",
    tagline:     "Harmonised ICT-risk regime for the EU financial sector; in force January 2025.",
    scope:       "Banks, insurers, investment firms, crypto-asset service providers, and their critical ICT third-party providers including AI and ML vendors.",
    triggers:    "Being an in-scope financial entity, or being designated a critical ICT third-party provider by the ESAs.",
    obligations: [
      "ICT risk management framework approved by the management body (Ch. II).",
      "Major incident classification and reporting within strict EBA timelines (Art. 17-23).",
      "Threat-led penetration testing every 3 years for significant entities (Ch. IV).",
      "Contractual register and key terms for all ICT third parties (Ch. V); concentration-risk monitoring.",
    ],
    enforcement: "Up to 1% of average daily worldwide turnover per day for critical ICT providers. Supervisory measures for financial entities.",
    norvarNote:  "Norvar produces the Art. 28 ICT register, contract clauses and TLPT scope documentation.",
    controls:    ["Ch. II ICT risk mgmt", "Art. 17-23 Incidents", "Ch. IV TLPT", "Ch. V 3rd-party risk", "Art. 45 Info sharing"],
    claudePrompt: "Explain DORA — ICT risk management requirements, incident reporting timelines, threat-led penetration testing obligations, and third-party ICT provider oversight for financial entities.",
  },

  {
    name:        "Cyber Resilience Act",
    abbr:        "CRA",
    domain:      "cyber",
    jurisdiction: "EU / EEA",
    status:      "in_force",
    year:        2024,
    sourceUrl:   "https://eur-lex.europa.eu/eli/reg/2024/2847/oj",
    badge:       "Cyber",
    tagline:     "Horizontal cybersecurity rules for products with digital elements; main obligations apply December 2027.",
    scope:       "Hardware and software products with digital elements placed on the EU market — including robots, controllers, firmware, and most connected B2B and B2C products.",
    triggers:    "Placing on the market; substantial modification; classification as important (Class I/II) or critical triggers higher-assurance routes.",
    obligations: [
      "Secure-by-design and secure-by-default per Annex I §1.",
      "Vulnerability handling for the support period (Annex I §2): SBOM, coordinated disclosure, free security updates.",
      "Conformity assessment (Art. 32) and CE marking; third-party assessment for important and critical classes.",
      "24-hour early warning and 72-hour notification of actively exploited vulnerabilities and severe incidents to ENISA (Art. 14).",
    ],
    enforcement: "Up to €15M or 2.5% of global turnover for essential-requirement breaches. Market withdrawal powers.",
    norvarNote:  "Norvar generates SBOM, vulnerability-handling policy and 24/72-hour notification templates per product line.",
    controls:    ["Annex I §1 Security", "Annex I §2 Vuln. handling", "Art. 13 Conformity", "Art. 14 Reporting"],
    claudePrompt: "Explain the EU Cyber Resilience Act — essential cybersecurity requirements for products with digital elements, vulnerability handling obligations, SBOM requirements, and CE marking.",
  },

  // ── EU — Robotics ────────────────────────────────────────────────────────────

  {
    name:        "EU Machinery Regulation",
    abbr:        "Machinery Reg.",
    domain:      "robotics",
    jurisdiction: "EU / EEA",
    status:      "upcoming",
    year:        2027,
    sourceUrl:   "https://eur-lex.europa.eu/eli/reg/2023/1230/oj",
    badge:       "Robotics",
    tagline:     "Replaces the 2006 Machinery Directive; covers AI-enabled and autonomous machinery from January 2027.",
    scope:       "Manufacturers, importers and distributors placing machinery, related products and partly-completed machinery on the EU market — explicitly including cobots, AMRs and AI safety functions.",
    triggers:    "Placing on the market or putting into service. Substantial modification of existing machinery. Integration of AI safety components.",
    obligations: [
      "Essential Health and Safety Requirements (Annex III), including ergonomics (§1.1.6) and control systems (§1.2).",
      "Annex I high-risk machinery including AI safety components requires third-party conformity assessment.",
      "Technical file (Art. 10) with risk assessment, AI training data documentation and substantial-modification policy.",
      "EU Declaration of Conformity and CE marking. Instructions in user language.",
      "Interplay with EU AI Act: shared conformity route for high-risk AI safety functions.",
    ],
    enforcement: "Market surveillance authorities. Product recall, withdrawal and administrative fines per national law.",
    norvarNote:  "Norvar aligns Machinery Regulation and AI Act conformity requirements into a single technical file workflow.",
    controls:    ["Annex I EHSR", "Annex III High-risk", "Art. 10 Tech file", "Art. 21-25 Conformity", "CE marking"],
    claudePrompt: "Explain the EU Machinery Regulation 2023/1230 — safety requirements for autonomous and AI-enabled machinery, conformity assessment procedures, and interaction with the EU AI Act for high-risk AI safety components.",
  },

  {
    name:        "EU Product Liability Directive",
    abbr:        "Product Liability Dir.",
    domain:      "robotics",
    jurisdiction: "EU / EEA",
    status:      "in_force",
    year:        2024,
    sourceUrl:   "https://eur-lex.europa.eu/eli/dir/2024/2853/oj",
    badge:       "EU",
    tagline:     "Modernised strict-liability regime covering software, AI systems and continuously-updated products.",
    scope:       "Manufacturers, importers, authorised representatives, fulfilment service providers and software providers placing products in the EU.",
    triggers:    "Personal injury, property damage, data loss or psychological harm caused by a defective product including AI-driven malfunctions and post-deployment learning issues.",
    obligations: [
      "Defectiveness assessed on safety the public is entitled to expect, including cybersecurity and self-learning behaviour (Art. 7).",
      "Disclosure of evidence on claimant request (Art. 9) — non-compliance creates presumption of defect.",
      "Rebuttable presumptions of defect and causation for technically complex products including AI (Art. 10).",
      "Liability period extended to 25 years for latent injuries; financial caps removed.",
    ],
    enforcement: "Civil litigation in national courts. Class actions enabled under the Representative Actions Directive.",
    norvarNote:  "Norvar maintains the evidence and version log needed to rebut the Art. 10 defect presumptions.",
    controls:    ["Art. 4 Defectiveness", "Art. 6 Damages", "Art. 8 Disclosure", "Art. 9 Presumption", "Art. 10 Rebuttable presumptions"],
    claudePrompt: "Explain the revised EU Product Liability Directive — strict liability for AI systems and software, defectiveness presumptions for technically complex AI, and disclosure of evidence obligations.",
  },

  // ── US — Federal ──────────────────────────────────────────────────────────────

  {
    name:        "NIST AI Risk Management Framework",
    abbr:        "NIST AI RMF",
    domain:      "ai",
    jurisdiction: "US Federal",
    status:      "in_force",
    year:        2023,
    sourceUrl:   "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf",
    badge:       "US",
    tagline:     "Voluntary US framework for trustworthy and responsible AI, plus the 2024 Generative AI Profile.",
    scope:       "Any organisation designing, developing, deploying or using AI. Widely adopted as the de-facto US baseline and referenced by procurement and insurers.",
    triggers:    "Voluntary, but expected by US federal customers (via OMB M-24-10), many state laws and enterprise vendor reviews.",
    obligations: [
      "GOVERN: policies, accountability, culture, third-party risk.",
      "MAP: context, intended use, stakeholders, impacts.",
      "MEASURE: trustworthy characteristics — valid, safe, secure, accountable, explainable, privacy-enhanced, fair.",
      "MANAGE: prioritise, respond, monitor and communicate residual risk.",
      "GenAI Profile adds 12 risk categories including CBRN, confabulation, IP, data privacy, with suggested actions.",
    ],
    enforcement: "Not legally binding, but referenced by US EO, OMB memos and ISO 42001 alignment.",
    norvarNote:  "Norvar pre-fills GOVERN, MAP, MEASURE, MANAGE artefacts per AI system and maps them to ISO 42001.",
    controls:    ["GOVERN 1-6", "MAP 1-5", "MEASURE 1-4", "MANAGE 1-4", "GenAI Profile"],
    claudePrompt: "Explain the NIST AI Risk Management Framework v1.0 core functions — GOVERN, MAP, MEASURE, MANAGE — and the 2024 Generative AI profile's 12 risk categories.",
  },

  {
    name:        "NIST Cybersecurity Framework 2.0",
    abbr:        "NIST CSF 2.0",
    domain:      "cyber",
    jurisdiction: "US Federal",
    status:      "in_force",
    year:        2024,
    sourceUrl:   "https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf",
    badge:       "Cyber",
    tagline:     "Expanded 2024 release adding GOVERN as a sixth function alongside Identify, Protect, Detect, Respond, Recover.",
    scope:       "Any organisation, any sector, any size. Widely used in US critical infrastructure, vendor due diligence and insurance underwriting.",
    triggers:    "Voluntary baseline; often required contractually or as part of NIST SP 800-53, 800-171 or CMMC programmes.",
    obligations: [
      "GOVERN (GV): cyber strategy, roles, supply-chain risk, oversight.",
      "IDENTIFY (ID): asset, risk and improvement management.",
      "PROTECT (PR): identity, access, awareness, data, platform security.",
      "DETECT (DE), RESPOND (RS), RECOVER (RC) functions plus profiles and implementation tiers.",
    ],
    enforcement: "Not statutory. Backed by sector regulators and contract clauses.",
    norvarNote:  "Norvar maps CSF 2.0 subcategories to your tech stack and produces a current and target profile.",
    controls:    ["GOVERN (GV)", "IDENTIFY (ID)", "PROTECT (PR)", "DETECT (DE)", "RESPOND (RS)", "RECOVER (RC)"],
    claudePrompt: "Explain NIST Cybersecurity Framework 2.0 — the new GOVERN function, the six core functions, and how to map controls for AI and technology environments.",
  },

  {
    name:        "Fair Credit Reporting Act",
    abbr:        "FCRA",
    domain:      "adm",
    jurisdiction: "US Federal",
    status:      "in_force",
    year:        1970,
    sourceUrl:   "https://uscode.house.gov/view.xhtml?path=/prelim@title15/chapter41/subchapterIII&edition=prelim",
    badge:       "US",
    tagline:     "Governs consumer reporting agencies and the use of consumer reports in credit, employment and housing decisions.",
    scope:       "Consumer reporting agencies, users of consumer reports, and furnishers of information. Applies to AI-driven credit decisions and any system producing consumer reports.",
    triggers:    "Using consumer report data for credit, employment, housing, insurance or other eligibility decisions — including AI and ML model outputs.",
    obligations: [
      "Adverse action notices with specific reasons — black-box AI outputs are insufficient under CFPB guidance.",
      "Permissible purpose required for accessing consumer reports.",
      "Accuracy obligations for furnishers and dispute rights for consumers.",
      "CFPB has confirmed FCRA applies to AI/ML credit models including third-party vendor models.",
    ],
    enforcement: "FTC and CFPB enforcement. Private right of action for wilful and negligent violations. State AG enforcement.",
    norvarNote:  "Norvar identifies FCRA adverse-action notice gaps and explainability requirements for AI credit models.",
    controls:    ["Adverse action notices", "Permissible purpose", "Accuracy obligations", "Consumer dispute rights", "CFPB AI model guidance"],
    claudePrompt: "Explain FCRA obligations for AI-driven credit decisions — adverse action notice requirements, why black-box AI outputs are insufficient, CFPB guidance on ML model explainability, and consumer dispute rights.",
  },

  {
    name:        "FTC Act Section 5",
    abbr:        "FTC Act §5",
    domain:      "adm",
    jurisdiction: "US Federal",
    status:      "in_force",
    year:        1914,
    sourceUrl:   "https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act",
    badge:       "US",
    tagline:     "Primary US federal authority used against deceptive AI claims, biased models and data misuse.",
    scope:       "Substantially all US commercial activity. FTC has used §5 to police AI hype, biased models, dark patterns and data-protection failures.",
    triggers:    "Marketing AI capabilities, using AI in consumer-facing decisions, or processing consumer data without adequate safeguards.",
    obligations: [
      "No deceptive claims about AI capabilities, accuracy or training data.",
      "No unfair practices — substantial unavoidable consumer injury not outweighed by benefits.",
      "Reasonable data security. Honour stated privacy promises.",
      "Model deletion and algorithmic disgorgement as known remedies.",
    ],
    enforcement: "FTC orders, 20-year consent decrees, civil penalties up to $51,744 per violation (2024), and algorithmic disgorgement.",
    norvarNote:  "Norvar reviews AI marketing claims and data-handling against recent FTC enforcement themes and the 2023 biometric policy statement.",
    controls:    ["§5 Unfair acts", "§5 Deceptive acts", "Algorithmic disgorgement", "Biometric policy 2023", "Impersonation Rule 16 CFR 461"],
    claudePrompt: "Explain FTC Section 5 enforcement against unfair or deceptive AI practices — what constitutes a deceptive AI claim, algorithmic disgorgement remedy, and the FTC biometric data policy statement.",
  },

  {
    name:        "HIPAA Privacy and Security Rules",
    abbr:        "HIPAA",
    domain:      "privacy",
    jurisdiction: "US Federal",
    status:      "in_force",
    year:        1996,
    sourceUrl:   "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164",
    badge:       "US",
    tagline:     "Governs use and disclosure of protected health information by covered entities and business associates.",
    scope:       "Health plans, healthcare clearinghouses, healthcare providers and their business associates including AI vendors processing PHI.",
    triggers:    "Any collection, use or disclosure of PHI. AI systems processing health data for diagnostics, monitoring or administration are in scope.",
    obligations: [
      "Minimum necessary standard for all PHI use and disclosure.",
      "Patient rights: access, amendment, accounting of disclosures.",
      "Business Associate Agreements with all PHI processors including AI vendors.",
      "Breach notification to HHS OCR and affected individuals within 60 days.",
      "2024 Security Rule update proposals: mandatory MFA, encryption and audit controls.",
    ],
    enforcement: "HHS Office for Civil Rights. Fines up to $1.9M per violation category per year. Criminal penalties for wilful neglect.",
    norvarNote:  "Norvar identifies HIPAA PHI flows in AI deployments and surfaces BAA and Security Rule gaps.",
    controls:    ["§164.308 Admin safeguards", "§164.310 Physical safeguards", "§164.312 Technical safeguards", "§164.314 BAA", "§164.502 Uses & disclosures", "§164.524 Patient access", "§164.33-34 Breach notification"],
    claudePrompt: "Explain HIPAA Privacy and Security Rule obligations for AI and computer vision systems handling PHI, including the 2024 Security Rule update proposals for MFA and encryption.",
  },

  {
    name:        "Cybersecurity Maturity Model Certification 2.0",
    abbr:        "CMMC 2.0",
    domain:      "cyber",
    jurisdiction: "US Federal",
    status:      "in_force",
    year:        2025,
    sourceUrl:   "https://dodcio.defense.gov/CMMC/",
    badge:       "Cyber",
    tagline:     "DoD certification regime layered on NIST SP 800-171. Final rule effective December 2024, contract clauses phasing in 2025-2028.",
    scope:       "Entire US DoD industrial base including subcontractors handling FCI or CUI, and AI and robotics vendors.",
    triggers:    "Inclusion of DFARS 252.204-7021 in a DoD contract. Type of information handled determines Level 1, 2 or 3.",
    obligations: [
      "Level 1: 17 FAR safeguards, annual self-assessment.",
      "Level 2: 110 SP 800-171 controls, triennial C3PAO assessment for most CUI contracts.",
      "Level 3: 110 plus selected 800-172 controls, DIBCAC government assessment.",
      "Annual senior-official affirmation in SPRS.",
    ],
    enforcement: "Loss of award eligibility. False Claims Act exposure for inaccurate affirmations.",
    norvarNote:  "Norvar maps AI and robotics stack to CMMC Level 2 and pre-assesses gaps before a C3PAO assessment.",
    controls:    ["Level 1 (17 practices)", "Level 2 (110 / 800-171)", "Level 3 (800-172)", "C3PAO assessment", "Annual affirmation"],
    claudePrompt: "Explain CMMC 2.0 — assessment levels, mapping to NIST SP 800-171, and obligations for defense contractors using AI or robotics systems.",
  },

  {
    name:        "SEC Cybersecurity Disclosure Rule",
    abbr:        "SEC Cyber Rule",
    domain:      "cyber",
    jurisdiction: "US Federal",
    status:      "in_force",
    year:        2023,
    sourceUrl:   "https://www.sec.gov/files/rules/final/2023/33-11216.pdf",
    badge:       "Cyber",
    tagline:     "Mandates incident and governance disclosures for public companies subject to US securities reporting.",
    scope:       "US public companies (10-K, 8-K filers) and foreign private issuers.",
    triggers:    "Determination that a cybersecurity incident is material. Annual reporting cycle.",
    obligations: [
      "Item 1.05 of Form 8-K: disclose material incidents within 4 business days of materiality determination.",
      "Reg S-K Item 106: annual disclosure of cyber risk management, strategy and governance including board oversight.",
      "Foreign private issuers: comparable disclosures on Form 6-K and 20-F.",
    ],
    enforcement: "SEC enforcement actions. Recent cases targeting under-disclosure and misleading risk-factor language.",
    norvarNote:  "Norvar produces materiality-decision playbooks and 8-K Item 1.05 disclosure templates.",
    controls:    ["8-K Item 1.05 Material incidents", "S-K Item 106(b) Risk mgmt", "S-K Item 106(c) Governance", "20-F Item 16K"],
    claudePrompt: "Explain the SEC cybersecurity disclosure rule — Form 8-K Item 1.05 material incident disclosure requirements, Regulation S-K Item 106 governance disclosures, and what constitutes materiality for cyber incidents.",
  },

  // ── US — State AI and ADM ─────────────────────────────────────────────────────

  {
    name:        "California CCPA/CPRA + ADMT Regulations",
    abbr:        "CCPA / CPRA",
    domain:      "adm",
    jurisdiction: "US State",
    status:      "in_force",
    year:        2025,
    sourceUrl:   "https://cppa.ca.gov/regulations/",
    badge:       "US",
    tagline:     "California's omnibus privacy law plus the 2025 Automated Decisionmaking Technology regulations.",
    scope:       "For-profits in California with $26.625M+ revenue, 100K+ consumers, or 50%+ revenue from selling or sharing data. Reaches B2B and HR data.",
    triggers:    "Collection of California consumer personal information. Use of ADMT for significant decisions in employment, housing, finance, healthcare or education.",
    obligations: [
      "Consumer rights: know, delete, correct, opt-out of sale or sharing, limit use of Sensitive PI.",
      "Notice at collection and a Do Not Sell or Share My Personal Information link.",
      "Risk assessments and cybersecurity audits for high-risk processing.",
      "ADMT pre-use notice, opt-out right, access to outputs, and risk assessment per 2025 rules — effective Jan 2027 for rights.",
      "Contractual requirements with service providers, contractors and third parties.",
    ],
    enforcement: "CPPA and California AG. $2,500 per violation, $7,500 per intentional or minor's violation. Private right of action for breaches.",
    norvarNote:  "Norvar surfaces ADMT notice and opt-out gaps and pre-fills the CPPA risk assessment template.",
    controls:    ["§1798.100 Notice", "§1798.105 Delete", "§1798.120 Opt-out sale", "§1798.121 Limit SPI", "§1798.185 ADMT regs", "§1798.140 Risk assess."],
    claudePrompt: "Explain CCPA/CPRA and the 2025 Automated Decisionmaking Technology regulations — consumer rights, ADMT pre-use notice requirements, opt-out rights for significant decisions, and risk assessment obligations.",
  },

  {
    name:        "Colorado AI Act (SB 24-205)",
    abbr:        "Colorado AI Act",
    domain:      "ai",
    jurisdiction: "US State",
    status:      "in_force",
    year:        2026,
    sourceUrl:   "https://leg.colorado.gov/bills/sb24-205",
    badge:       "US",
    tagline:     "First comprehensive US state AI law for high-risk systems; effective February 2026.",
    scope:       "Developers and deployers of high-risk artificial intelligence systems that make or are a substantial factor in consequential decisions for Colorado residents.",
    triggers:    "Use of AI in employment, education, financial services, housing, insurance, healthcare, legal services or government services.",
    obligations: [
      "Developers: documentation, intended uses, known limitations, training data description, risk-mitigation guidance to deployers.",
      "Deployers: risk-management programme, annual impact assessments, consumer notice before consequential decision, right to appeal and human review.",
      "Public statement summarising AI use. Report algorithmic discrimination to the AG within 90 days.",
      "Affirmative defence for organisations following the NIST AI RMF or comparable framework.",
    ],
    enforcement: "Exclusive AG enforcement under the Colorado Consumer Protection Act. Civil penalties up to $20,000 per violation.",
    norvarNote:  "Norvar generates the impact assessment, consumer notices and AG discrimination report in the required format.",
    controls:    ["§6-1-1702 Developer duty", "§6-1-1703 Deployer duty", "Impact assessment", "Consumer notice", "Right to appeal", "AG enforcement"],
    claudePrompt: "Explain the Colorado AI Act (SB 24-205) — high-risk AI definitions, developer and deployer duties, impact assessment requirements, consumer notice obligations, and the NIST AI RMF affirmative defence.",
  },

  {
    name:        "NYC Local Law 144 — Automated Employment Decision Tools",
    abbr:        "NYC LL144",
    domain:      "adm",
    jurisdiction: "US Local",
    status:      "in_force",
    year:        2023,
    sourceUrl:   "https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page",
    badge:       "US",
    tagline:     "Bias-audit and notice law for Automated Employment Decision Tools used on NYC candidates or employees.",
    scope:       "Employers and employment agencies using AEDTs to substantially assist or replace discretionary employment decisions for NYC-based roles.",
    triggers:    "Using a tool that issues a simplified output — score, classification or recommendation — for hiring or promotion in NYC.",
    obligations: [
      "Independent bias audit within the past year covering sex, race and ethnicity, and intersectional categories.",
      "Public summary of audit results on the employer's website.",
      "Candidate notice at least 10 business days before use, with job qualifications and characteristics assessed.",
      "Maintain audit and data-quality records for inspection.",
    ],
    enforcement: "NYC DCWP. $500 first violation, up to $1,500 per subsequent violation per day.",
    norvarNote:  "Norvar coordinates the annual bias audit checklist and generates the required candidate notice language.",
    controls:    ["§20-870 Definitions", "§20-871 Bias audit", "§20-872 Notice", "Audit publication", "Impact ratios by category"],
    claudePrompt: "Explain NYC Local Law 144 — what constitutes an AEDT, independent bias audit requirements including intersectional categories, candidate notice obligations, and publication of audit results.",
  },

  {
    name:        "Texas Responsible AI Governance Act",
    abbr:        "TRAIGA",
    domain:      "ai",
    jurisdiction: "US State",
    status:      "in_force",
    year:        2026,
    sourceUrl:   "https://statutes.capitol.texas.gov/",
    badge:       "US",
    tagline:     "Texas AI governance law prohibiting high-risk AI causing unlawful discrimination; effective January 2026.",
    scope:       "Developers and deployers of AI systems used in high-risk contexts in Texas including employment, education, healthcare, housing and financial services.",
    triggers:    "Deployment of AI making or substantially influencing consequential decisions affecting Texas residents.",
    obligations: [
      "Prohibition on deploying AI that causes or is likely to cause unlawful discrimination.",
      "Developers must document intended use cases, limitations and bias testing results.",
      "Deployers must maintain human oversight for high-risk decisions and provide notice to affected individuals.",
      "Data minimisation and purpose limitation for sensitive categories.",
    ],
    enforcement: "AG enforcement. Civil penalties and injunctive relief.",
    norvarNote:  "Norvar flags high-risk AI deployments in Texas and surfaces discriminatory outcome risks.",
    controls:    ["Discrimination prohibition", "Developer documentation", "Human oversight", "Consumer notice", "AG enforcement"],
    claudePrompt: "Explain the Texas Responsible AI Governance Act (TRAIGA) — high-risk AI definitions, developer and deployer obligations, discrimination prohibition, and enforcement by the Texas AG.",
  },

  // ── US — Biometrics ──────────────────────────────────────────────────────────

  {
    name:        "Illinois Biometric Information Privacy Act",
    abbr:        "BIPA",
    domain:      "cv",
    jurisdiction: "US State",
    status:      "in_force",
    year:        2008,
    sourceUrl:   "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004",
    badge:       "Vision",
    tagline:     "Strict consent and private right of action regime for biometric identifiers in Illinois.",
    scope:       "Any private entity collecting biometric identifiers or information from Illinois residents — face geometry, fingerprints, iris and retina scans, voiceprints, hand and face geometry.",
    triggers:    "Capture, storage or use of biometric identifiers, including by AI vision systems, access control, time clocks and robotics safety cameras.",
    obligations: [
      "Written policy establishing retention schedule and destruction guidelines before any collection.",
      "Informed written consent before capturing or using biometric data.",
      "No sale or profit from biometric data.",
      "Reasonable safeguards consistent with organisational standards for other confidential data.",
      "2024 amendment: one statutory recovery per violation, not per scan.",
    ],
    enforcement: "Private right of action. $1,000 per negligent violation, $5,000 per intentional or reckless violation. Settlements: Facebook $650M (2020), Google $100M (2022), Meta $1.4B Texas CUBI (2024).",
    norvarNote:  "Norvar identifies computer vision systems capturing Illinois biometric data and surfaces BIPA consent and retention gap risks.",
    controls:    ["§15(a) Written policy", "§15(b) Informed consent", "§15(c) No sale", "§15(d) No disclosure", "§15(e) Safeguards", "§20 Damages"],
    claudePrompt: "Explain Illinois BIPA — what constitutes biometric identifiers, written consent requirements, the private right of action, damages exposure for AI vision systems, and how the 2024 amendment affects per-scan damages.",
  },

  {
    name:        "Texas Capture or Use of Biometric Identifiers",
    abbr:        "CUBI",
    domain:      "cv",
    jurisdiction: "US State",
    status:      "in_force",
    year:        2009,
    sourceUrl:   "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.503.htm",
    badge:       "Vision",
    tagline:     "Texas biometric privacy law with AG enforcement. Meta paid $1.4B settlement in 2024.",
    scope:       "Any person capturing a biometric identifier of an individual for a commercial purpose in Texas.",
    triggers:    "Capturing facial geometry, fingerprints, retina or iris scans, voiceprints, or hand/face geometry for commercial purposes.",
    obligations: [
      "Informed consent before capturing biometric identifiers.",
      "Retention schedule and destruction policy.",
      "Prohibition on selling biometric identifiers.",
      "Civil penalties up to $25,000 per violation.",
    ],
    enforcement: "Texas AG enforcement only — no private right of action. Penalties up to $25,000 per violation. Meta paid $1.4B in 2024.",
    norvarNote:  "Norvar identifies commercial CV deployments capturing Texas biometric data and surfaces CUBI consent gaps.",
    controls:    ["Informed consent", "Retention policy", "No sale prohibition", "AG enforcement", "$25K per violation"],
    claudePrompt: "Explain Texas CUBI — scope of biometric identifiers covered, informed consent requirements, prohibition on sale, AG enforcement, and the significance of the Meta $1.4B settlement.",
  },

  // ── Canada ────────────────────────────────────────────────────────────────────

  {
    name:        "Personal Information Protection and Electronic Documents Act",
    abbr:        "PIPEDA",
    domain:      "privacy",
    jurisdiction: "Canada",
    status:      "in_force",
    year:        2000,
    sourceUrl:   "https://laws-lois.justice.gc.ca/eng/acts/p-8.6/",
    badge:       "CA",
    tagline:     "Canadian federal private-sector privacy law, being modernised by Bill C-27.",
    scope:       "Private-sector organisations collecting, using or disclosing personal information in the course of commercial activities across Canada (except provinces with substantially similar laws).",
    triggers:    "Any commercial processing of Canadian personal information, including AI training and inference.",
    obligations: [
      "Ten Fair Information Principles: accountability, identifying purpose, consent, limiting collection, limiting use and disclosure, limiting retention, accuracy, safeguards, openness, individual access, challenging compliance.",
      "Meaningful consent — express for sensitive data; opt-out only where appropriate.",
      "Breach reporting to OPC and affected individuals for real risk of significant harm.",
      "Recordkeeping for all breaches.",
    ],
    enforcement: "OPC investigations. Federal Court enforcement. Up to CAD $100K for breach-record offences. Bill C-27 proposes AMPs up to 5% of global revenue.",
    norvarNote:  "Norvar tracks consent quality and breach-record obligations across Canadian deployments.",
    controls:    ["P1 Accountability", "P2 Identifying purposes", "P3 Consent", "P4 Limiting collection", "P7 Safeguards", "P9 Individual access", "OPC GenAI principles"],
    claudePrompt: "Explain PIPEDA obligations relevant to AI systems — meaningful consent, accountability principle, OPC guidance on generative AI, and cross-border transfer expectations.",
  },

  {
    name:        "Quebec Law 25",
    abbr:        "Quebec Law 25",
    domain:      "privacy",
    jurisdiction: "Canada",
    status:      "in_force",
    year:        2024,
    sourceUrl:   "https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1",
    badge:       "CA",
    tagline:     "Quebec's modernised private-sector privacy regime; fully in force September 2024.",
    scope:       "Any enterprise processing personal information of Quebec residents.",
    triggers:    "Collection of personal data in Quebec. Cross-border transfers. Use of automated decision systems. Biometric data use.",
    obligations: [
      "Designate a Privacy Officer; publish their title and contact.",
      "Privacy Impact Assessment for any IT project involving personal data and for cross-border transfers.",
      "Notify individuals of automated decisions and provide opportunity to make observations.",
      "Express consent for biometric processing including prior notice to the CAI.",
      "Right to data portability and right to de-indexation.",
    ],
    enforcement: "CAI. AMPs up to CAD $10M or 2% of worldwide turnover. Penal fines up to CAD $25M or 4%.",
    norvarNote:  "Norvar produces the PIA and automated decision-making notice templates aligned with CAI guidance.",
    controls:    ["§3.1 Privacy officer", "§8.1 PIA", "§12.1 ADM disclosure", "§14 Consent", "§17 Transfers", "§63.5 Biometric reg.", "§90.1 Penalties"],
    claudePrompt: "Explain Quebec Law 25 — Privacy Impact Assessments, automated decision-making transparency and explanation rights, biometric registration requirements, and penalties compared to GDPR.",
  },

  // ── International Standards ───────────────────────────────────────────────────

  {
    name:        "ISO/IEC 42001:2023 — AI Management System",
    abbr:        "ISO 42001",
    domain:      "standards",
    jurisdiction: "International",
    status:      "in_force",
    year:        2023,
    sourceUrl:   "https://www.iso.org/standard/81230.html",
    badge:       "Standards",
    tagline:     "First certifiable AI management system standard; increasingly required in enterprise procurement.",
    scope:       "Any organisation that develops, provides or uses AI systems — sector- and size-agnostic.",
    triggers:    "Decision to operate an AI management system. Certification often required by enterprise buyers and procurement.",
    obligations: [
      "PDCA-based AIMS covering context, leadership, planning, support, operation, evaluation, improvement.",
      "Annex A: 39 controls across AI policy, internal organisation, resources, impact assessment, life cycle, data, information for interested parties, third-party use.",
      "AI risk and impact assessments aligned with NIST AI RMF and EU AI Act terminology.",
    ],
    enforcement: "Voluntary. Certification by accredited bodies. Strong alignment with EU AI Act QMS (Art. 17).",
    norvarNote:  "Norvar pre-fills ISO 42001 Annex A control evidence from your existing programme.",
    controls:    ["Clause 4 Context", "Clause 5 Leadership", "Clause 6 Planning", "Clause 8 Operation", "Clause 9 Evaluation", "Annex A 39 controls"],
    claudePrompt: "Explain ISO/IEC 42001:2023 — the AI management system structure, Annex A controls, alignment with NIST AI RMF and EU AI Act, and how it is used as evidence in regulatory compliance programmes.",
  },

  {
    name:        "ISO/IEC 27001:2022 — Information Security Management",
    abbr:        "ISO 27001",
    domain:      "standards",
    jurisdiction: "International",
    status:      "in_force",
    year:        2022,
    sourceUrl:   "https://www.iso.org/standard/27001",
    badge:       "Standards",
    tagline:     "Global standard for information security management systems; widely required in enterprise vendor due diligence.",
    scope:       "Any organisation managing information security. Widely required by enterprise customers and referenced by NIS2 and DORA.",
    triggers:    "Certification commitments, customer due diligence, regulatory references.",
    obligations: [
      "ISMS clauses 4-10: context, leadership, planning, support, operation, evaluation, improvement.",
      "Annex A 2022: 93 controls in four themes — Organisational, People, Physical, Technological.",
      "Risk-based Statement of Applicability and continual improvement.",
    ],
    enforcement: "Loss of certification. Contractual and reputational impact. Referenced by NIS2 and DORA as aligned standard.",
    norvarNote:  "Norvar maps AI and robotics-specific controls to Annex A 2022 themes.",
    controls:    ["Clause 4-10 ISMS", "Annex A Organisational", "Annex A People", "Annex A Physical", "Annex A Technological", "Statement of Applicability"],
    claudePrompt: "Explain ISO 27001:2022 — the ISMS structure, the updated Annex A 2022 control themes, and how it relates to NIS2, DORA and GDPR Art. 32 security obligations.",
  },

  {
    name:        "ISO 10218 + ISO/TS 15066 — Robot Safety",
    abbr:        "ISO 10218 / 15066",
    domain:      "robotics",
    jurisdiction: "International",
    status:      "in_force",
    year:        2011,
    sourceUrl:   "https://www.iso.org/standard/51330.html",
    badge:       "Robotics",
    tagline:     "Core safety standards for industrial robots and collaborative robot operation.",
    scope:       "Manufacturers, integrators and users of industrial robots and cobots, including AMRs operating in industrial settings.",
    triggers:    "Designing, integrating or deploying a robot or cobot in a workspace shared with people.",
    obligations: [
      "ISO 10218-1: safety requirements for the robot itself — control, stop, speed, axis limits, collaborative functions.",
      "ISO 10218-2: integration requirements — risk assessment, layout, safeguarding, validation.",
      "ISO/TS 15066: collaborative operation design and biomechanical force and pressure limits.",
      "Aligns with EU Machinery Regulation EHSR and referenced by EU AI Act safety component logic.",
    ],
    enforcement: "Not statutory itself, but treated as state-of-the-art under EU Machinery Regulation and OSHA general duty.",
    norvarNote:  "Norvar links collaborative-task risk assessments to ISO 15066 force and pressure limits per robot.",
    controls:    ["ISO 10218-1 Robot safety", "ISO 10218-2 Integration", "ISO/TS 15066 Collaborative ops", "Risk assessment", "Safeguarding"],
    claudePrompt: "Explain ISO 10218 and ISO/TS 15066 — safety requirements for industrial robots and cobots, biomechanical force limits for collaborative operation, and how they relate to the EU Machinery Regulation.",
  },

  {
    name:        "SOC 2 (AICPA Trust Services Criteria)",
    abbr:        "SOC 2",
    domain:      "standards",
    jurisdiction: "International",
    status:      "in_force",
    year:        2017,
    sourceUrl:   "https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services",
    badge:       "Standards",
    tagline:     "US attestation report on Security, Availability, Processing Integrity, Confidentiality and Privacy. Required in most B2B SaaS enterprise procurement.",
    scope:       "Service organisations — especially SaaS, AI and ML platforms and data processors — that customers want assurance over.",
    triggers:    "Enterprise sales requirement, vendor risk management, board and investor expectations.",
    obligations: [
      "Common Criteria (CC1-CC9): control environment, communication, risk, monitoring, control activities, logical access, system operations, change management, risk mitigation.",
      "Optional categories: Availability, Processing Integrity, Confidentiality, Privacy.",
      "Type I: design at a point in time. Type II: operating effectiveness over 3-12 months.",
    ],
    enforcement: "Not regulatory. Failed report or qualified opinion threatens contracts and renewals.",
    norvarNote:  "Norvar maps your AI pipeline controls to SOC 2 Common Criteria and trust services criteria.",
    controls:    ["CC1-CC9 Common Criteria", "Availability category", "Confidentiality category", "Privacy category", "Type I / Type II"],
    claudePrompt: "Explain SOC 2 — the Trust Services Criteria, Common Criteria control categories, difference between Type I and Type II reports, and what AI companies should prioritise for their first SOC 2 audit.",
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────────────────

/** Get a framework by abbreviation (case-insensitive) */
export function getFramework(abbr: string): FrameworkMeta | undefined {
  return FRAMEWORKS.find(
    f => f.abbr.toLowerCase() === abbr.toLowerCase() ||
         f.name.toLowerCase().includes(abbr.toLowerCase())
  );
}

/** Get all frameworks for a given domain */
export function getFrameworksByDomain(domain: FrameworkDomain): FrameworkMeta[] {
  return FRAMEWORKS.filter(f => f.domain === domain);
}

/** Get all frameworks for a given jurisdiction (partial match) */
export function getFrameworksByJurisdiction(jurisdiction: string): FrameworkMeta[] {
  return FRAMEWORKS.filter(f =>
    f.jurisdiction.toLowerCase().includes(jurisdiction.toLowerCase())
  );
}

/** Get frameworks by status */
export function getFrameworksByStatus(status: FrameworkStatus): FrameworkMeta[] {
  return FRAMEWORKS.filter(f => f.status === status);
}

/**
 * Build a compact framework reference string for injection into the Claude
 * system prompt — lists all frameworks with their key controls.
 * Keeps token usage manageable while giving Claude precise citation material.
 */
export function buildFrameworkPromptContext(
  domains?: FrameworkDomain[],
  jurisdictions?: string[]
): string {
  let frameworks = FRAMEWORKS;

  if (domains?.length) {
    frameworks = frameworks.filter(f => domains.includes(f.domain));
  }

  if (jurisdictions?.length) {
    frameworks = frameworks.filter(f =>
      jurisdictions.some(j =>
        f.jurisdiction.toLowerCase().includes(j.toLowerCase())
      )
    );
  }

  return frameworks.map(f => [
    `[${f.abbr}] ${f.name} (${f.jurisdiction} · ${f.status})`,
    `Scope: ${f.scope}`,
    `Key controls: ${f.controls.slice(0, 6).join(", ")}`,
    `Enforcement: ${f.enforcement}`,
  ].join("\n")).join("\n\n");
}

export default FRAMEWORKS;
