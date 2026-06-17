// Norvar — Sprint 6: Varro Contract Redline Quality Audit
// 20 contracts testing Varro's clause detection, redline accuracy, and corpus grounding
// Tests /api/redline — clause-level accuracy, severity assignment, suggested text quality

export const REDLINE_QUERIES = [

  // ─── DPA REDLINES (5 queries) ─────────────────────────────────────────────

  {
    id: "VR-01",
    label: "DPA — missing lawful basis and data subject rights",
    type: "dpa",
    contract: `DATA PROCESSING AGREEMENT

Between: TechCorp Inc. ("Processor") and Acme Ltd. ("Controller")

1. Scope
The Processor will process personal data on behalf of the Controller for the purpose of providing cloud storage services.

2. Data Processing
The Processor may process the following categories of data: names, email addresses, usage logs.

3. Security
The Processor will implement reasonable security measures to protect the data.

4. Sub-processors
The Processor may engage sub-processors without prior notice to the Controller.

5. Term
This agreement shall continue until terminated by either party with 30 days notice.`,
    expected: {
      overall_status: ["needs_work", "significant_issues", "do_not_sign"],
      must_flag: ["lawful basis", "data subject rights", "sub-processor", "breach notification", "deletion"],
      must_cite: ["GDPR", "GDPR Art. 28"],
      min_issues: 3,
      must_have_missing_clauses: true,
    },
    redFlags: [
      "Returns 'clean' for a DPA missing lawful basis and data subject rights",
      "Does not flag the unlimited sub-processor clause",
      "Does not flag absence of breach notification procedure",
      "Does not cite GDPR Art. 28",
    ],
  },

  {
    id: "VR-02",
    label: "DPA — international transfer with no mechanism",
    type: "dpa",
    contract: `DATA PROCESSING AGREEMENT

Between: EU Health Platform GmbH ("Controller") and US Cloud Services Inc. ("Processor")

1. Processing Activities
Processor will store and process patient health records on behalf of Controller.
Data will be stored on servers located in the United States.

2. Security
Processor maintains SOC 2 Type II certification and encrypts data at rest.

3. Breach Notification
Processor will notify Controller of any data breach within 72 hours.

4. Data Retention
Controller data will be retained for the duration of the contract and deleted within 30 days of termination.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["international transfer", "Standard Contractual Clauses", "adequacy", "health data", "special category"],
      must_cite: ["GDPR", "SCCs", "GDPR Chapter V"],
      min_issues: 2,
    },
    redFlags: [
      "Does not flag the EU-US transfer without an SCC or adequacy mechanism",
      "Does not flag health data as special category requiring additional protection",
      "Returns 'needs_work' instead of 'significant_issues' or 'do_not_sign'",
    ],
  },

  {
    id: "VR-03",
    label: "DPA — well drafted, minimal issues expected",
    type: "dpa",
    contract: `DATA PROCESSING AGREEMENT

Between: Norvar Inc. ("Processor") and Customer Corp. ("Controller")

1. Definitions
"Personal Data", "Processing", "Controller", "Processor" have the meanings given in GDPR Article 4.

2. Scope and Instructions
Processor shall process Personal Data only on documented instructions from Controller, including with regard to transfers to third countries.

3. Confidentiality
Processor ensures persons authorised to process Personal Data have committed to confidentiality.

4. Security (Article 32 GDPR)
Processor implements appropriate technical and organisational measures including encryption at rest (AES-256), encryption in transit (TLS 1.3), access controls, and regular security testing.

5. Sub-processors
Processor shall not engage sub-processors without prior written authorisation of Controller. Current sub-processors are listed in Annex II. Controller is notified of changes 30 days in advance.

6. Data Subject Rights
Processor assists Controller in responding to data subject requests under GDPR Articles 15-22 within 5 business days.

7. Breach Notification
Processor notifies Controller of any Personal Data breach without undue delay and in any event within 24 hours of becoming aware.

8. International Transfers
Transfers outside the EEA are subject to Standard Contractual Clauses (Commission Decision 2021/914).

9. Deletion
Upon termination, Processor deletes or returns all Personal Data within 30 days and provides written certification.

10. Audit Rights
Controller may audit Processor's compliance with this Agreement upon 30 days notice, no more than once per year.`,
    expected: {
      overall_status: ["clean", "needs_work"],
      must_flag: [],
      must_cite: [],
      max_issues: 2,
      must_have_positive_clauses: true,
    },
    redFlags: [
      "Returns 'significant_issues' or 'do_not_sign' for a well-drafted DPA",
      "Invents issues not present in the contract",
      "Does not identify any positive clauses",
      "Flags the 24-hour breach notification as a problem (it is better than GDPR's 72 hours)",
    ],
  },

  {
    id: "VR-04",
    label: "DPA — HIPAA context, missing BAA obligations",
    type: "dpa",
    contract: `DATA PROCESSING AGREEMENT

Between: HealthTech Inc. ("Business Associate") and City Hospital ("Covered Entity")

1. Services
Business Associate provides cloud-based EHR storage services to Covered Entity.
Data processed includes patient names, diagnoses, medications, and treatment records.

2. Permitted Uses
Business Associate may use Protected Health Information only to provide services to Covered Entity.

3. Security
Business Associate maintains reasonable and appropriate safeguards for PHI.

4. Breach Notification
Business Associate will notify Covered Entity of any breach of unsecured PHI.

5. Termination
Upon termination, Business Associate will return or destroy all PHI.`,
    expected: {
      overall_status: ["needs_work", "significant_issues"],
      must_flag: ["HIPAA", "minimum necessary", "workforce training", "encryption", "audit controls", "contingency plan"],
      must_cite: ["HIPAA", "HIPAA Security Rule"],
      min_issues: 2,
    },
    redFlags: [
      "Does not identify this as a BAA context requiring HIPAA-specific obligations",
      "Does not flag missing HIPAA Security Rule technical safeguards",
      "Returns 'clean' for a BAA missing minimum necessary standard and workforce training",
    ],
  },

  {
    id: "VR-05",
    label: "DPA — CCPA context, California users",
    type: "dpa",
    contract: `SERVICE AGREEMENT — DATA TERMS

Between: Analytics Co. ("Service Provider") and Retailer Inc. ("Business")

1. Data Processing
Service Provider processes consumer purchase history, browsing behavior, and device identifiers for analytics purposes on behalf of Business.
All consumers are located in California.

2. Data Use
Service Provider agrees not to sell consumer personal information.
Service Provider may use consumer data to improve its own services and machine learning models.

3. Security
Service Provider maintains industry-standard security practices.

4. Term
Agreement continues for one year and renews automatically.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["service provider", "CCPA", "cross-context behavioral advertising", "opt-out", "consumer rights", "deletion request"],
      must_cite: ["CCPA", "CPRA"],
      min_issues: 2,
    },
    redFlags: [
      "Does not flag that using consumer data to improve own models may constitute 'selling' under CCPA",
      "Does not flag missing consumer rights obligations",
      "Does not cite CCPA/CPRA for California consumer data",
    ],
  },

  // ─── MSA REDLINES (4 queries) ─────────────────────────────────────────────

  {
    id: "VR-06",
    label: "MSA — one-sided indemnification, no liability cap",
    type: "msa",
    contract: `MASTER SERVICES AGREEMENT

Between: Vendor Corp. ("Vendor") and Client Inc. ("Client")

1. Services
Vendor will provide software development services as described in each Statement of Work.

2. Indemnification
Client shall indemnify, defend, and hold harmless Vendor from any and all claims, damages, and expenses arising from Client's use of the Services, including claims by third parties.

3. Intellectual Property
All work product created by Vendor shall remain the property of Vendor. Client receives a non-exclusive license to use deliverables.

4. Confidentiality
Both parties agree to keep the other's confidential information private for a period of one year.

5. Governing Law
This agreement is governed by the laws of the State of Delaware.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["indemnification", "liability cap", "intellectual property", "confidentiality", "one-sided"],
      must_cite: [],
      min_issues: 3,
    },
    redFlags: [
      "Does not flag the one-sided indemnification covering Vendor only",
      "Does not flag the absence of a mutual liability cap",
      "Does not flag that work product IP staying with Vendor is unusual and unfavourable for Client",
      "Does not flag the 1-year confidentiality term as insufficient",
    ],
  },

  {
    id: "VR-07",
    label: "MSA — AI product, missing AI governance obligations",
    type: "msa",
    contract: `MASTER SERVICES AGREEMENT — AI PLATFORM

Between: AI Solutions Ltd. ("Provider") and Enterprise Co. ("Customer")

1. Services
Provider offers an AI-powered hiring decision platform that screens, scores, and ranks job applicants.
The platform operates in the EU and United States.

2. Performance
Provider warrants the platform will be available 99.5% of the time.

3. Data
Customer owns all data submitted to the platform.
Provider may use aggregated anonymised data to improve its models.

4. Liability
Provider's liability is limited to fees paid in the preceding 3 months.

5. Term
Initial term of 12 months, renewing annually.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["EU AI Act", "high-risk AI", "human oversight", "bias audit", "transparency", "automated decision", "NYC LL144"],
      must_cite: ["EU AI Act", "GDPR Art. 22", "NYC LL144"],
      min_issues: 3,
    },
    redFlags: [
      "Does not flag EU AI Act high-risk AI obligations for an automated hiring tool",
      "Does not flag GDPR Art. 22 automated decision-making requirements",
      "Does not flag NYC LL144 bias audit requirement",
      "Returns 'needs_work' instead of 'significant_issues' for a high-risk AI agreement with no AI governance clauses",
    ],
  },

  {
    id: "VR-08",
    label: "MSA — SaaS, UK post-Brexit data terms",
    type: "msa",
    contract: `SAAS SUBSCRIPTION AGREEMENT

Between: CloudSoft Ltd. ("Provider") and UK Business Ltd. ("Customer")

1. Services
Provider offers cloud-based CRM software to Customer.
Customer's employees are based in England and Scotland.

2. Data Protection
Both parties agree to comply with GDPR in their handling of personal data.

3. Security
Provider maintains ISO 27001 certification.

4. Processing
Provider processes employee and customer contact data on Customer's behalf.

5. Termination
Either party may terminate with 30 days notice. Provider will delete Customer data within 90 days.`,
    expected: {
      overall_status: ["needs_work", "significant_issues"],
      must_flag: ["UK GDPR", "Data Protection Act 2018", "ICO", "UK adequacy"],
      must_cite: ["UK GDPR", "UK DPA 2018"],
      min_issues: 2,
    },
    redFlags: [
      "References EU GDPR instead of UK GDPR for a UK-based agreement post-Brexit",
      "Does not flag that GDPR reference should be UK GDPR",
      "Does not mention ICO as the relevant supervisory authority",
    ],
  },

  {
    id: "VR-09",
    label: "MSA — cybersecurity product, missing incident response",
    type: "msa",
    contract: `MASTER SERVICES AGREEMENT — SECURITY PLATFORM

Between: SecureOps Inc. ("Provider") and FinServ Bank ("Customer")

1. Services
Provider delivers a real-time threat detection and security monitoring platform to Customer.
Customer is a financial institution regulated under DORA.

2. Security Standards
Provider maintains SOC 2 Type II and conducts annual penetration tests.

3. Uptime
Provider commits to 99.9% monthly uptime.

4. Data
Provider processes Customer's security logs and network traffic data.

5. Liability
Each party's liability is capped at €500,000.

6. Term
3-year initial term with annual renewal thereafter.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["DORA", "incident reporting", "ICT risk", "supply chain", "right to audit", "NIS2"],
      must_cite: ["DORA", "NIS2"],
      min_issues: 3,
    },
    redFlags: [
      "Does not flag DORA ICT risk management obligations for a financial institution",
      "Does not flag missing incident reporting timeline under DORA",
      "Does not flag missing right-to-audit clause required under DORA",
      "Returns 'needs_work' for an MSA with a DORA-regulated entity missing all DORA provisions",
    ],
  },

  // ─── ISA REDLINES (3 queries) ─────────────────────────────────────────────

  {
    id: "VR-10",
    label: "ISA — missing encryption and breach notification",
    type: "isa",
    contract: `INFORMATION SECURITY ADDENDUM

Between: SaaS Provider Inc. ("Provider") and Client Corp. ("Client")

1. Security Programme
Provider maintains an information security programme consistent with industry standards.

2. Access Controls
Provider implements role-based access controls for its systems.

3. Personnel
Provider requires employees to complete annual security training.

4. Audits
Provider undergoes annual third-party security assessments.

5. Termination
Upon termination, Provider will securely delete Client data.`,
    expected: {
      overall_status: ["needs_work", "significant_issues"],
      must_flag: ["encryption", "breach notification", "penetration testing", "patch management", "business continuity"],
      must_cite: ["ISO 27001", "NIST CSF"],
      min_issues: 3,
    },
    redFlags: [
      "Does not flag absence of encryption requirements",
      "Does not flag missing breach notification timeline",
      "Does not flag missing penetration testing requirement",
      "Returns 'clean' for an ISA with no encryption or breach notification clauses",
    ],
  },

  {
    id: "VR-11",
    label: "ISA — IoT product, EU CRA context",
    type: "isa",
    contract: `INFORMATION SECURITY ADDENDUM — CONNECTED DEVICES

Between: IoT Manufacturer GmbH ("Manufacturer") and Retailer AG ("Reseller")

1. Product Security
Manufacturer implements security-by-design principles in all connected devices.

2. Updates
Manufacturer provides software updates for device functionality.

3. Data
Devices collect usage data and transmit to Manufacturer's cloud platform.

4. Vulnerability Management
Manufacturer investigates reported security vulnerabilities on a reasonable timeline.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["EU Cyber Resilience Act", "default password", "patch management", "vulnerability disclosure", "security support period"],
      must_cite: ["EU CRA"],
      min_issues: 3,
    },
    redFlags: [
      "Does not flag EU Cyber Resilience Act obligations for connected products sold in EU",
      "Does not flag missing default password prohibition",
      "Does not flag vague vulnerability management timeline",
      "Does not flag missing defined security support period",
    ],
  },

  {
    id: "VR-12",
    label: "ISA — financial sector, missing DORA controls",
    type: "isa",
    contract: `INFORMATION SECURITY ADDENDUM

Between: FinTech Provider Ltd. ("Provider") and EU Bank SA ("Bank")

1. Security Controls
Provider implements encryption, access controls, and monitoring consistent with SOC 2 Type II.

2. Incident Response
Provider maintains an incident response plan and will notify Bank of security incidents.

3. Business Continuity
Provider maintains a business continuity plan tested annually.

4. Audit
Bank may request Provider's security assessment reports annually.`,
    expected: {
      overall_status: ["needs_work", "significant_issues"],
      must_flag: ["DORA", "ICT incident classification", "RTO", "RPO", "threat-led penetration testing", "concentration risk"],
      must_cite: ["DORA", "NIS2"],
      min_issues: 2,
    },
    redFlags: [
      "Does not flag DORA-specific ICT incident reporting timelines",
      "Does not flag missing RTO/RPO requirements under DORA",
      "Does not flag missing threat-led penetration testing (TLPT) requirement",
    ],
  },

  // ─── NDA REDLINES (3 queries) ──────────────────────────────────────────────

  {
    id: "VR-13",
    label: "NDA — perpetual confidentiality, no standard exceptions",
    type: "nda",
    contract: `NON-DISCLOSURE AGREEMENT

Between: Company A and Company B

1. Confidential Information
All information shared between the parties is confidential.

2. Obligations
Neither party shall disclose any confidential information to any third party ever.

3. Term
This agreement is perpetual and irrevocable.

4. Remedies
Breach of this agreement entitles the non-breaching party to injunctive relief and unlimited damages.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["no exceptions", "perpetual", "publicly available", "independently developed", "required by law", "unlimited damages"],
      must_cite: [],
      min_issues: 3,
    },
    redFlags: [
      "Does not flag the absence of standard confidentiality exceptions",
      "Does not flag perpetual term as commercially unusual and potentially unenforceable",
      "Does not flag unlimited damages as an aggressive and likely unenforceable provision",
    ],
  },

  {
    id: "VR-14",
    label: "NDA — one-way, protects discloser only",
    type: "nda",
    contract: `MUTUAL NON-DISCLOSURE AGREEMENT

Between: TechStartup Inc. ("Discloser") and BigCorp Ltd. ("Recipient")

1. Confidential Information
Discloser may share proprietary business information, technical specifications, and financial data with Recipient.

2. Recipient Obligations
Recipient agrees not to disclose Discloser's Confidential Information to third parties for 3 years.
Recipient may use Confidential Information only to evaluate a potential partnership.

3. Exceptions
Information is not confidential if it was already known to the public.

4. Return of Materials
Upon request, Recipient will return all Confidential Information to Discloser.`,
    expected: {
      overall_status: ["needs_work", "significant_issues"],
      must_flag: ["one-way", "mutual", "independently developed", "required by law", "residuals"],
      must_cite: [],
      min_issues: 2,
    },
    redFlags: [
      "Does not flag that the agreement is titled 'Mutual' but only protects Discloser",
      "Does not flag incomplete exceptions list missing 'independently developed' and 'required by law'",
    ],
  },

  // ─── AI USE AGREEMENT (3 queries) ─────────────────────────────────────────

  {
    id: "VR-15",
    label: "AI Use Agreement — no human oversight or transparency",
    type: "ai_use",
    contract: `ARTIFICIAL INTELLIGENCE USE AGREEMENT

Between: AI Platform Co. ("Provider") and Insurance Corp. ("Customer")

1. Services
Provider supplies an AI model that assesses insurance claims and recommends approval or denial.
The model operates autonomously without human review of individual decisions.

2. Accuracy
Provider warrants the model is accurate based on historical training data.

3. Data
Customer provides claims data for model inputs. Provider may use outcomes data to improve the model.

4. Liability
Provider is not liable for incorrect model recommendations.

5. Term
Annual subscription, renewing automatically.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["human oversight", "explainability", "automated decision", "GDPR Art. 22", "EU AI Act", "bias", "right to explanation"],
      must_cite: ["EU AI Act", "GDPR Art. 22"],
      min_issues: 4,
    },
    redFlags: [
      "Does not flag autonomous claims decisions without human review as a critical gap",
      "Does not flag EU AI Act high-risk classification for insurance AI",
      "Does not flag GDPR Art. 22 right not to be subject to automated decisions",
      "Returns 'needs_work' for a fully automated high-stakes AI system with zero oversight clauses",
    ],
  },

  {
    id: "VR-16",
    label: "AI Use Agreement — generative AI, no content disclosure",
    type: "ai_use",
    contract: `GENERATIVE AI ACCEPTABLE USE POLICY

Between: GenAI Corp. ("Provider") and Media Co. ("Customer")

1. Service
Provider supplies a generative AI text and image creation service.
Customer may use outputs for marketing materials, social media, and customer communications.

2. Content
Customer is responsible for reviewing AI-generated content before publication.
Provider does not guarantee content accuracy.

3. Data
Customer prompts and outputs are used to improve Provider's models.

4. Intellectual Property
Provider claims no ownership over Customer outputs.`,
    expected: {
      overall_status: ["needs_work", "significant_issues"],
      must_flag: ["AI-generated content disclosure", "transparency", "training data", "copyright", "EU AI Act", "FTC"],
      must_cite: ["EU AI Act", "FTC AI Guidance"],
      min_issues: 2,
    },
    redFlags: [
      "Does not flag EU AI Act transparency obligation for AI-generated content",
      "Does not flag FTC guidance on disclosure of AI-generated content",
      "Does not flag using Customer prompts to train Provider models without explicit consent",
    ],
  },

  // ─── EDGE CASES (4 queries) ───────────────────────────────────────────────

  {
    id: "VR-17",
    label: "Edge — very short contract, limited redline scope",
    type: "msa",
    contract: `SERVICE AGREEMENT

Party A will provide consulting services to Party B.
Party B will pay Party A $5,000 per month.
Either party may terminate with 2 weeks notice.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["confidentiality", "intellectual property", "liability", "dispute resolution"],
      must_have_missing_clauses: true,
      min_issues: 3,
    },
    redFlags: [
      "Returns 'clean' for a severely incomplete contract",
      "Does not flag missing confidentiality, IP, liability, and dispute resolution",
      "Invents specific clause numbers that don't exist in the contract",
    ],
  },

  {
    id: "VR-18",
    label: "Edge — children's platform, COPPA missing",
    type: "msa",
    contract: `PLATFORM SERVICES AGREEMENT

Between: KidsApp Inc. ("Provider") and School District ("Customer")

1. Services
Provider offers an educational gaming platform for students aged 5-12.

2. Data Collection
Provider collects student names, grades, usage statistics, and progress data.

3. Data Sharing
Provider may share anonymised student data with educational research partners.

4. Security
Provider implements encryption and access controls.

5. Term
Annual subscription renewable by Customer.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["COPPA", "FERPA", "parental consent", "children", "verifiable consent", "data minimisation"],
      must_cite: ["COPPA", "FERPA"],
      min_issues: 3,
    },
    redFlags: [
      "Does not flag COPPA as mandatory for a children's platform collecting personal data",
      "Does not flag FERPA for student educational records",
      "Does not flag that sharing 'anonymised' student data with research partners without parental consent may violate COPPA",
    ],
  },

  {
    id: "VR-19",
    label: "Edge — biometric data, BIPA context",
    type: "msa",
    contract: `WORKFORCE MANAGEMENT AGREEMENT

Between: HRTech Co. ("Provider") and Manufacturing Inc. ("Customer")

1. Services
Provider supplies biometric timekeeping systems using fingerprint and facial recognition.
Customer's workforce is based in Illinois.

2. Data Collection
Provider collects biometric identifiers for attendance tracking.
Data is retained for the duration of employment plus 3 years.

3. Security
Provider encrypts biometric data and limits access to authorised personnel.

4. Third Parties
Provider may share biometric data with payroll processing partners.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["BIPA", "written consent", "destruction schedule", "private right of action", "profit from biometric data"],
      must_cite: ["BIPA"],
      min_issues: 3,
    },
    redFlags: [
      "Does not flag BIPA for biometric data collection in Illinois",
      "Does not flag BIPA requirement for written policy and destruction schedule",
      "Does not flag that retaining biometric data 3 years post-employment may violate BIPA",
      "Does not flag sharing biometric data with payroll partners without written consent as a BIPA violation",
    ],
  },

  {
    id: "VR-20",
    label: "Edge — global deployment, multiple jurisdiction gaps",
    type: "msa",
    contract: `GLOBAL SAAS AGREEMENT

Between: Global Platform Inc. ("Provider") and International Corp. ("Customer")

1. Services
Provider delivers a customer analytics platform processing user behaviour data.
Customer operates in EU, UK, Brazil, Singapore, and California.

2. Data Protection
Provider and Customer agree to comply with applicable data protection laws.

3. Security
Provider is SOC 2 Type II certified.

4. Data Retention
User data is retained for 7 years for analytics purposes.

5. Term
3-year initial term.`,
    expected: {
      overall_status: ["significant_issues", "do_not_sign"],
      must_flag: ["GDPR", "UK GDPR", "LGPD", "PDPA", "CCPA", "purpose limitation", "retention", "lawful basis"],
      must_cite: ["GDPR", "UK GDPR", "LGPD", "PDPA", "CCPA"],
      min_issues: 4,
    },
    redFlags: [
      "Does not flag jurisdiction-specific obligations for each of the 5 regions",
      "Does not flag 7-year retention as potentially disproportionate under GDPR purpose limitation",
      "Returns 'needs_work' for a global contract with blanket 'comply with applicable laws' language",
    ],
  },
];

export default REDLINE_QUERIES;
