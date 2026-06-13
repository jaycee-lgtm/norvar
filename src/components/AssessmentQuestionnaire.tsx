"use client";

import { useState } from "react";
import { ChevronRight, ChevronLeft, Check, Plus } from "lucide-react";

type Option = { value: string; label: string };

type Question = {
  id:           string;
  text:         string;
  sub?:         string;
  type:         "single" | "multi" | "text";
  options?:     Option[];
  domains?:     string[];
  required?:    boolean;
  riskTag?:     string;
};

type Answers = Record<string, string | string[]>;

export type QuestionnaireMeta = {
  domains?:       string[];
  jurisdictions?: string[];
  data_types?:    string[];
  sector?:        string;
  stage?:         string;
  deployment?:    string;
};

interface Props {
  onComplete: (description: string, meta: QuestionnaireMeta) => void;
}

const ALL_QUESTIONS: Question[] = [
  {
    id: "domains", required: true,
    text: "Which compliance domains apply to your project?",
    sub:  "Select all that apply. This drives every question that follows.",
    type: "multi",
    options: [
      { value: "privacy",       label: "Privacy"        },
      { value: "ai_governance", label: "AI Governance"  },
      { value: "cybersecurity", label: "Cybersecurity"  },
    ],
  },
  {
    id: "stage", required: true,
    text: "Where is this project in its lifecycle?",
    type: "single",
    options: [
      { value: "new_build",    label: "New build, not yet deployed"           },
      { value: "planning",     label: "Still in planning or design stage"     },
      { value: "existing",     label: "Existing system, already live"         },
      { value: "major_update", label: "Significant update to existing system" },
    ],
  },
  {
    id: "jurisdictions", required: true,
    text: "Which jurisdictions will this be deployed in or affect?",
    sub:  "Select all that apply.",
    type: "multi",
    options: [
      { value: "eu",         label: "EU / EEA"          },
      { value: "uk",         label: "United Kingdom"    },
      { value: "us_federal", label: "US Federal"        },
      { value: "us_state",   label: "US State-level"    },
      { value: "canada",     label: "Canada"            },
      { value: "apac",       label: "Asia Pacific"      },
      { value: "africa",     label: "Africa"            },
      { value: "latam",      label: "Latin America"     },
      { value: "mena",       label: "Middle East"       },
      { value: "global",     label: "Global / not yet determined" },
    ],
  },
  {
    id: "deployment_type", required: true,
    text: "What type of system or product is this?",
    type: "single",
    options: [
      { value: "saas",      label: "SaaS application"              },
      { value: "mobile",    label: "Mobile application"            },
      { value: "ai_model",  label: "AI / ML model or system"       },
      { value: "hardware",  label: "Physical device or hardware"   },
      { value: "api",       label: "API or developer platform"     },
      { value: "internal",  label: "Internal tool"                 },
      { value: "robotics",  label: "Robotics or autonomous system" },
      { value: "iot",       label: "IoT / connected device"        },
    ],
  },
  {
    id: "sector",
    text: "What sector or industry does this operate in?",
    type: "single",
    options: [
      { value: "healthcare",      label: "Healthcare"                },
      { value: "finance",         label: "Financial services"        },
      { value: "hr_recruitment",  label: "HR / Recruitment"        },
      { value: "education",       label: "Education"                 },
      { value: "government",      label: "Government / Public sector"},
      { value: "retail",          label: "Retail / eCommerce"        },
      { value: "transport",       label: "Transport / Logistics"     },
      { value: "legal",           label: "Legal services"            },
      { value: "media_adtech",    label: "Media / AdTech"            },
      { value: "proptech",        label: "Real estate / PropTech"    },
      { value: "other",           label: "Other"                     },
    ],
  },
  {
    id: "data_subjects", domains: ["privacy"],
    text: "Whose personal data does the system process?",
    sub:  "Select all that apply.",
    type: "multi",
    options: [
      { value: "consumers",  label: "Consumers or end users"      },
      { value: "employees",  label: "Employees or workers"        },
      { value: "children",   label: "Children under 13"          },
      { value: "patients",   label: "Patients or health data subjects" },
      { value: "students",   label: "Students"                   },
      { value: "no_pi",      label: "No personal data processed" },
    ],
    riskTag: "High risk if children or patients",
  },
  {
    id: "biometrics", domains: ["privacy"],
    text: "Does the system collect or process biometric data?",
    sub:  "Biometric data includes facial geometry, fingerprints, iris scans, voiceprints, and hand geometry.",
    type: "single",
    riskTag: "Critical",
    options: [
      { value: "biometric_primary",   label: "Yes, biometrics are central to the system"     },
      { value: "biometric_secondary", label: "Yes, incidentally or for access control"       },
      { value: "biometric_no",        label: "No biometric data involved"                   },
      { value: "biometric_unknown",   label: "Not yet determined"                            },
    ],
  },
  {
    id: "images_video", domains: ["privacy"],
    text: "Does the system capture, store, or process images or video of individuals?",
    type: "single",
    riskTag: "High risk",
    options: [
      { value: "iv_continuous",  label: "Yes, continuous surveillance or monitoring"    },
      { value: "iv_event",       label: "Yes, event-triggered or on-demand capture"    },
      { value: "iv_stored",      label: "Yes, stored footage reviewed by humans"       },
      { value: "iv_no",          label: "No images or video of individuals"            },
    ],
  },
  {
    id: "financial_data", domains: ["privacy"],
    text: "Does the system process financial transaction data?",
    sub:  "Includes payment card data, bank account details, transaction history, or credit data.",
    type: "single",
    riskTag: "High risk",
    options: [
      { value: "fin_primary",   label: "Yes, financial data is core to the product"     },
      { value: "fin_secondary", label: "Yes, collected but not the primary function"    },
      { value: "fin_no",        label: "No financial transaction data"                  },
    ],
  },
  {
    id: "automated_decisioning_privacy", domains: ["privacy"],
    text: "Does the system make automated decisions about individuals without human review?",
    sub:  "For example: loan approvals, content filtering, access decisions, eligibility scoring.",
    type: "single",
    riskTag: "Critical — GDPR Art.22",
    options: [
      { value: "adm_fully",     label: "Yes, fully automated with no human review"         },
      { value: "adm_assisted",  label: "Automated recommendations, human makes final call" },
      { value: "adm_no",        label: "No automated decisions about individuals"          },
    ],
  },
  {
    id: "sensitive_categories", domains: ["privacy"],
    text: "Does the system process any other special-category data?",
    sub:  "Select all that apply.",
    type: "multi",
    riskTag: "High risk",
    options: [
      { value: "health",        label: "Health or medical data"              },
      { value: "genetic",       label: "Genetic data"                        },
      { value: "racial",        label: "Racial or ethnic origin"             },
      { value: "political",     label: "Political opinions"                  },
      { value: "religious",     label: "Religious or philosophical beliefs"  },
      { value: "sexual",        label: "Sexual orientation or gender identity"},
      { value: "criminal",      label: "Criminal convictions or offences"    },
      { value: "none_special",  label: "None of the above"                   },
    ],
  },
  {
    id: "lawful_basis", domains: ["privacy"],
    text: "What is the intended lawful basis for processing personal data?",
    type: "single",
    options: [
      { value: "consent",      label: "Consent"                        },
      { value: "contract",     label: "Contract performance"           },
      { value: "legal_obligation", label: "Legal obligation"          },
      { value: "vital_interest",   label: "Vital interests"           },
      { value: "legitimate_interests", label: "Legitimate interests"  },
      { value: "public_task",  label: "Public task"                   },
      { value: "unknown_basis",label: "Not yet determined"            },
    ],
  },
  {
    id: "data_transfers", domains: ["privacy"],
    text: "Will personal data be transferred outside the country of collection?",
    type: "single",
    options: [
      { value: "transfer_eu_adequate",   label: "Yes, to countries with adequacy decisions" },
      { value: "transfer_eu_sccs",       label: "Yes, using SCCs or equivalent safeguards" },
      { value: "transfer_no_safeguards", label: "Yes, no transfer mechanism in place yet"  },
      { value: "transfer_internal",      label: "No, all data stays in country of collection" },
      { value: "transfer_unknown",       label: "Not yet determined"                        },
    ],
    riskTag: "High risk if no mechanism",
  },
  {
    id: "data_retention", domains: ["privacy"],
    text: "Is there a defined data retention and deletion policy?",
    type: "single",
    options: [
      { value: "retention_yes",      label: "Yes, documented and enforced"              },
      { value: "retention_partial",  label: "Partial, not consistently applied"         },
      { value: "retention_no",       label: "No retention policy in place"              },
      { value: "retention_unknown",  label: "Not yet determined"                        },
    ],
  },
  {
    id: "dpia_status", domains: ["privacy"],
    text: "Has a Data Protection Impact Assessment (DPIA or PIA) been conducted?",
    type: "single",
    options: [
      { value: "dpia_done",      label: "Yes, completed and documented"           },
      { value: "dpia_underway",  label: "In progress"                             },
      { value: "dpia_no",        label: "No, not yet started"                     },
      { value: "dpia_required",  label: "Required but not yet scheduled"          },
    ],
    riskTag: "Mandatory for high-risk processing",
  },
  {
    id: "third_party_processors", domains: ["privacy"],
    text: "Does the system share personal data with third-party vendors or processors?",
    sub:  "Select all that apply.",
    type: "multi",
    options: [
      { value: "cloud_provider",  label: "Cloud infrastructure provider"       },
      { value: "analytics",       label: "Analytics or tracking vendors"       },
      { value: "ai_vendor",       label: "AI or ML service providers"          },
      { value: "crm",             label: "CRM or marketing platforms"          },
      { value: "no_third_party",  label: "No third-party data sharing"         },
    ],
  },
  {
    id: "ai_use_case", domains: ["ai_governance"],
    text: "What is the primary use case for the AI system?",
    sub:  "Select all that apply.",
    type: "multi",
    riskTag: "Determines EU AI Act Annex III risk class",
    options: [
      { value: "hiring",           label: "Hiring or employment decisions"          },
      { value: "healthcare_ai",    label: "Healthcare diagnosis or treatment"       },
      { value: "credit_ai",        label: "Credit scoring or lending"               },
      { value: "law_enforcement",  label: "Law enforcement or public safety"        },
      { value: "education_ai",     label: "Education or student assessment"         },
      { value: "content_mod",      label: "Content moderation"                     },
      { value: "customer_service", label: "Customer service or chatbots"           },
      { value: "infrastructure",   label: "Critical infrastructure management"      },
      { value: "general_purpose",  label: "General purpose / GPAI model"           },
      { value: "other_ai",         label: "Other"                                  },
    ],
  },
  {
    id: "ai_decision_making", domains: ["ai_governance"],
    text: "Does the AI system make or substantially influence decisions about individuals?",
    type: "single",
    riskTag: "Critical — EU AI Act Art.14, GDPR Art.22",
    options: [
      { value: "adm_fully_auto",   label: "Fully automated, no human review"             },
      { value: "adm_human_loop",   label: "Human reviews before final decision"          },
      { value: "adm_recommendation",label: "Provides recommendations only"              },
      { value: "adm_no_decisions", label: "Does not make decisions about individuals"   },
    ],
  },
  {
    id: "ai_computer_vision", domains: ["ai_governance"],
    text: "Does the AI system use computer vision to identify, classify, or track individuals?",
    type: "single",
    riskTag: "Critical — EU AI Act Art.5 prohibited practices",
    options: [
      { value: "cv_realtime_public",  label: "Yes, real-time identification in public spaces"  },
      { value: "cv_workplace",        label: "Yes, workplace monitoring or tracking"            },
      { value: "cv_biometric",        label: "Yes, biometric categorisation or emotion detection" },
      { value: "cv_no_people",        label: "Yes, but not identifying or tracking individuals"  },
      { value: "cv_none",             label: "No computer vision"                               },
    ],
  },
  {
    id: "ai_biometrics", domains: ["ai_governance"],
    text: "Does the AI system process biometric data as part of its function?",
    type: "single",
    riskTag: "Critical",
    options: [
      { value: "aib_facial",      label: "Yes, facial recognition"                   },
      { value: "aib_other",       label: "Yes, other biometric identifiers"           },
      { value: "aib_emotion",     label: "Yes, emotion or affect recognition"         },
      { value: "aib_no",          label: "No biometric processing"                   },
    ],
  },
  {
    id: "ai_images_video", domains: ["ai_governance"],
    text: "Does the AI system process images or video as input or output?",
    type: "single",
    options: [
      { value: "aiv_training",    label: "Yes, images or video used in training data"     },
      { value: "aiv_inference",   label: "Yes, processes images or video at inference"    },
      { value: "aiv_generates",   label: "Yes, generates images or video as output"       },
      { value: "aiv_no",          label: "No image or video processing"                   },
    ],
  },
  {
    id: "ai_automated_decisioning", domains: ["ai_governance"],
    text: "Is automated decisioning technology (ADT) embedded in the system?",
    sub:  "ADT includes rule engines, scoring systems, ranking algorithms, and ML classifiers that trigger actions.",
    type: "single",
    riskTag: "High risk — CCPA ADMT, Colorado AI Act",
    options: [
      { value: "adt_core",      label: "Yes, ADT is the core of the product"           },
      { value: "adt_component", label: "Yes, ADT is one component among others"        },
      { value: "adt_no",        label: "No automated decisioning technology"            },
      { value: "adt_unknown",   label: "Not yet determined"                             },
    ],
  },
  {
    id: "ai_training_data", domains: ["ai_governance"],
    text: "What does the model train on?",
    sub:  "Select all that apply.",
    type: "multi",
    riskTag: "Relevant to EU AI Act Art.10 and copyright risk",
    options: [
      { value: "td_personal_data", label: "Personal data of real individuals"       },
      { value: "td_public_web",    label: "Publicly scraped web data"               },
      { value: "td_synthetic",     label: "Synthetic or anonymised data"            },
      { value: "td_licensed",      label: "Licensed or proprietary datasets"        },
      { value: "td_user_generated",label: "User-generated content"                  },
      { value: "td_unknown",       label: "Not yet determined"                      },
    ],
  },
  {
    id: "ai_human_oversight", domains: ["ai_governance"],
    text: "What level of human oversight exists over the AI system?",
    type: "single",
    riskTag: "Required for high-risk AI — EU AI Act Art.14",
    options: [
      { value: "ho_full",        label: "Full human review before any action"           },
      { value: "ho_exception",   label: "Human review only on flagged or edge cases"    },
      { value: "ho_audit",       label: "Periodic human audit of outputs"              },
      { value: "ho_none",        label: "No human oversight"                            },
    ],
  },
  {
    id: "ai_explainability", domains: ["ai_governance"],
    text: "Can the AI system explain its decisions or outputs to affected individuals?",
    type: "single",
    riskTag: "Required — GDPR Art.22, FCRA, Colorado AI Act",
    options: [
      { value: "xai_yes",        label: "Yes, explanations are built in"              },
      { value: "xai_partial",    label: "Partially, high-level reasons only"          },
      { value: "xai_no",         label: "No, outputs are unexplainable (black box)"   },
      { value: "xai_unknown",    label: "Not yet assessed"                            },
    ],
  },
  {
    id: "ai_bias_testing", domains: ["ai_governance"],
    text: "Has the AI system been tested for bias, fairness, or discriminatory outcomes?",
    type: "single",
    riskTag: "Required — NYC LL144, Colorado AI Act",
    options: [
      { value: "bias_yes",       label: "Yes, formal bias audit completed"             },
      { value: "bias_internal",  label: "Internal testing only, no third-party audit"  },
      { value: "bias_no",        label: "No bias testing conducted"                    },
      { value: "bias_planned",   label: "Planned but not yet done"                     },
    ],
  },
  {
    id: "ai_third_party_models", domains: ["ai_governance"],
    text: "Does the system use third-party AI models or APIs?",
    sub:  "For example OpenAI, Anthropic, Google Gemini, Hugging Face, AWS Bedrock.",
    type: "single",
    options: [
      { value: "tpm_foundation",  label: "Yes, built on a foundation model API"       },
      { value: "tpm_finetuned",   label: "Yes, fine-tuned third-party base model"     },
      { value: "tpm_oss",         label: "Yes, open-source model deployed internally" },
      { value: "tpm_proprietary", label: "No, entirely proprietary model"             },
    ],
  },
  {
    id: "cyber_exposure", domains: ["cybersecurity"],
    text: "What best describes the system's cybersecurity exposure?",
    type: "single",
    riskTag: "Determines NIS2 / DORA scope",
    options: [
      { value: "ce_critical",    label: "Critical infrastructure or essential service"    },
      { value: "ce_financial",   label: "Financial sector — banking, insurance, payments" },
      { value: "ce_health",      label: "Healthcare or medical systems"                   },
      { value: "ce_saas",        label: "Cloud-hosted SaaS with external users"          },
      { value: "ce_internal",    label: "Internal systems, limited external access"       },
    ],
  },
  {
    id: "cyber_financial_data", domains: ["cybersecurity"],
    text: "Does the system process, store, or transmit financial transaction data?",
    sub:  "Includes payment card data, bank transfers, account numbers, or transaction history.",
    type: "single",
    riskTag: "High risk — PCI DSS, DORA, SEC Cyber Rule",
    options: [
      { value: "cfd_primary",    label: "Yes, financial data is the core product"     },
      { value: "cfd_secondary",  label: "Yes, as part of broader functionality"       },
      { value: "cfd_no",         label: "No financial transaction data"               },
    ],
  },
  {
    id: "cyber_biometrics", domains: ["cybersecurity"],
    text: "Does the system store or transmit biometric data?",
    type: "single",
    riskTag: "Critical — heightened breach notification obligations",
    options: [
      { value: "cb_stores",      label: "Yes, biometric data is stored"               },
      { value: "cb_transmits",   label: "Yes, biometric data is transmitted"          },
      { value: "cb_both",        label: "Yes, both stored and transmitted"            },
      { value: "cb_no",          label: "No biometric data handled"                  },
    ],
  },
  {
    id: "cyber_images_video", domains: ["cybersecurity"],
    text: "Does the system capture or store images or video for security or surveillance purposes?",
    type: "single",
    riskTag: "High risk — EU AI Act, NIS2",
    options: [
      { value: "civ_cctv",       label: "Yes, CCTV or physical surveillance"          },
      { value: "civ_remote",     label: "Yes, remote monitoring or screen capture"    },
      { value: "civ_access",     label: "Yes, for access control or authentication"   },
      { value: "civ_no",         label: "No image or video capture"                  },
    ],
  },
  {
    id: "cyber_automated_decisioning", domains: ["cybersecurity"],
    text: "Is automated decisioning technology used in the system's security controls?",
    sub:  "For example: automated threat detection, access denial, fraud flagging, anomaly response.",
    type: "single",
    riskTag: "High risk — NIS2 Art.21, DORA Ch.II",
    options: [
      { value: "cadt_yes",       label: "Yes, automated security decisions are made"   },
      { value: "cadt_partial",   label: "Automated flagging, human approves action"    },
      { value: "cadt_no",        label: "No automated security decisioning"            },
    ],
  },
  {
    id: "cyber_third_party", domains: ["cybersecurity"],
    text: "Do third parties or vendors have access to the system or its data?",
    sub:  "Select all that apply.",
    type: "multi",
    riskTag: "Key NIS2 and DORA obligation",
    options: [
      { value: "tp_cloud",       label: "Cloud infrastructure provider"               },
      { value: "tp_managed",     label: "Managed service or outsourced IT"            },
      { value: "tp_saas",        label: "SaaS tools with data access"                 },
      { value: "tp_contractor",  label: "Contractors or freelancers"                  },
      { value: "tp_no",          label: "No third-party access"                       },
    ],
  },
  {
    id: "cyber_incident_response", domains: ["cybersecurity"],
    text: "Does your organisation have a tested incident response plan?",
    type: "single",
    riskTag: "Mandatory — NIS2, DORA, SEC Cyber Rule",
    options: [
      { value: "ir_tested",      label: "Yes, documented and regularly tested"        },
      { value: "ir_documented",  label: "Documented but not tested"                   },
      { value: "ir_partial",     label: "Partial or informal process"                 },
      { value: "ir_no",          label: "No incident response plan"                   },
    ],
  },
  {
    id: "cyber_encryption", domains: ["cybersecurity"],
    text: "Is data encrypted at rest and in transit?",
    type: "single",
    riskTag: "Baseline requirement — ISO 27001, NIS2",
    options: [
      { value: "enc_both",       label: "Yes, encrypted at rest and in transit"       },
      { value: "enc_transit",    label: "In transit only"                             },
      { value: "enc_rest",       label: "At rest only"                                },
      { value: "enc_no",         label: "Not currently encrypted"                     },
      { value: "enc_partial",    label: "Partially implemented"                       },
    ],
  },
  {
    id: "cyber_mfa", domains: ["cybersecurity"],
    text: "Is multi-factor authentication enforced for system access?",
    type: "single",
    options: [
      { value: "mfa_all",        label: "Yes, enforced for all users"                 },
      { value: "mfa_admin",      label: "Admin and privileged accounts only"          },
      { value: "mfa_optional",   label: "Available but not enforced"                  },
      { value: "mfa_no",         label: "No MFA in place"                             },
    ],
  },
  {
    id: "cyber_pen_testing", domains: ["cybersecurity"],
    text: "Has the system undergone security testing or penetration testing?",
    type: "single",
    riskTag: "Required for DORA TLPT, SOC 2",
    options: [
      { value: "pt_regular",     label: "Yes, regular third-party penetration testing" },
      { value: "pt_once",        label: "Yes, conducted once at launch"                },
      { value: "pt_internal",    label: "Internal security reviews only"               },
      { value: "pt_no",          label: "No security testing conducted"                },
    ],
  },
  {
    id: "cyber_certifications", domains: ["cybersecurity"],
    text: "Does your organisation hold any security certifications?",
    sub:  "Select all that apply.",
    type: "multi",
    options: [
      { value: "iso27001",   label: "ISO 27001"          },
      { value: "soc2",       label: "SOC 2"              },
      { value: "pci_dss",    label: "PCI DSS"            },
      { value: "cmmc",       label: "CMMC"               },
      { value: "csa_star",   label: "CSA STAR"           },
      { value: "no_certs",   label: "None currently"     },
    ],
  },
  {
    id: "additional_context",
    text: "Anything else Norvar should know before running the assessment?",
    sub:  "Describe your deployment, flag specific concerns, or add context not covered above.",
    type: "text",
  },
];

function compilePrompt(answers: Answers): { description: string; meta: QuestionnaireMeta } {
  const get  = (id: string) => answers[id];
  const getA = (id: string) => (answers[id] as string[]) || [];

  const domains       = getA("domains");
  const jurisdictions = getA("jurisdictions");
  const sector        = get("sector") as string || "";

  const dataTypes: string[] = [];
  if (getA("sensitive_categories").length) dataTypes.push(...getA("sensitive_categories"));
  if (get("biometrics")?.toString().includes("biometric_p") || get("biometrics")?.toString().includes("biometric_s")) dataTypes.push("biometric");
  if (get("financial_data")?.toString().includes("fin_")) dataTypes.push("financial");
  if (get("cyber_financial_data")?.toString().includes("cfd_p") || get("cyber_financial_data")?.toString().includes("cfd_s")) dataTypes.push("financial");
  if (getA("sensitive_categories").includes("health")) dataTypes.push("health");

  const meta: QuestionnaireMeta = {
    domains,
    jurisdictions,
    data_types:  [...new Set(dataTypes)],
    sector,
    stage:       get("stage") as string | undefined,
    deployment:  get("deployment_type") as string | undefined,
  };

  const lines: string[] = [
    "COMPLIANCE ASSESSMENT REQUEST",
    `Domains: ${domains.join(", ") || "not specified"}`,
    `Jurisdictions: ${jurisdictions.join(", ") || "not specified"}`,
    `Sector: ${sector || "not specified"}`,
    `Project stage: ${get("stage") || "not specified"}`,
    `Deployment type: ${get("deployment_type") || "not specified"}`,
  ];

  if (domains.includes("privacy")) {
    lines.push("\nPRIVACY CONTEXT:");
    if (getA("data_subjects").length)        lines.push(`Data subjects: ${getA("data_subjects").join(", ")}`);
    if (get("biometrics"))                   lines.push(`Biometric data: ${get("biometrics")}`);
    if (get("images_video"))                 lines.push(`Images and video: ${get("images_video")}`);
    if (get("financial_data"))               lines.push(`Financial transaction data: ${get("financial_data")}`);
    if (get("automated_decisioning_privacy")) lines.push(`Automated decisioning: ${get("automated_decisioning_privacy")}`);
    if (getA("sensitive_categories").length) lines.push(`Special category data: ${getA("sensitive_categories").join(", ")}`);
    if (get("lawful_basis"))                 lines.push(`Lawful basis: ${get("lawful_basis")}`);
    if (get("data_transfers"))               lines.push(`Cross-border transfers: ${get("data_transfers")}`);
    if (get("data_retention"))               lines.push(`Data retention policy: ${get("data_retention")}`);
    if (get("dpia_status"))                  lines.push(`DPIA status: ${get("dpia_status")}`);
    if (getA("third_party_processors").length) lines.push(`Third-party processors: ${getA("third_party_processors").join(", ")}`);
  }

  if (domains.includes("ai_governance")) {
    lines.push("\nAI GOVERNANCE CONTEXT:");
    if (getA("ai_use_case").length)          lines.push(`AI use case: ${getA("ai_use_case").join(", ")}`);
    if (get("ai_decision_making"))           lines.push(`Decision-making: ${get("ai_decision_making")}`);
    if (get("ai_computer_vision"))           lines.push(`Computer vision: ${get("ai_computer_vision")}`);
    if (get("ai_biometrics"))                lines.push(`AI biometric processing: ${get("ai_biometrics")}`);
    if (get("ai_images_video"))             lines.push(`Images and video processing: ${get("ai_images_video")}`);
    if (get("ai_automated_decisioning"))     lines.push(`Automated decisioning technology: ${get("ai_automated_decisioning")}`);
    if (getA("ai_training_data").length)    lines.push(`Training data: ${getA("ai_training_data").join(", ")}`);
    if (get("ai_human_oversight"))           lines.push(`Human oversight: ${get("ai_human_oversight")}`);
    if (get("ai_explainability"))           lines.push(`Explainability: ${get("ai_explainability")}`);
    if (get("ai_bias_testing"))             lines.push(`Bias testing: ${get("ai_bias_testing")}`);
    if (get("ai_third_party_models"))       lines.push(`Third-party models: ${get("ai_third_party_models")}`);
  }

  if (domains.includes("cybersecurity")) {
    lines.push("\nCYBERSECURITY CONTEXT:");
    if (get("cyber_exposure"))               lines.push(`Exposure level: ${get("cyber_exposure")}`);
    if (get("cyber_financial_data"))         lines.push(`Financial data: ${get("cyber_financial_data")}`);
    if (get("cyber_biometrics"))             lines.push(`Biometric data storage: ${get("cyber_biometrics")}`);
    if (get("cyber_images_video"))           lines.push(`Image and video surveillance: ${get("cyber_images_video")}`);
    if (get("cyber_automated_decisioning"))  lines.push(`Automated security decisioning: ${get("cyber_automated_decisioning")}`);
    if (getA("cyber_third_party").length)   lines.push(`Third-party access: ${getA("cyber_third_party").join(", ")}`);
    if (get("cyber_incident_response"))      lines.push(`Incident response: ${get("cyber_incident_response")}`);
    if (get("cyber_encryption"))              lines.push(`Encryption: ${get("cyber_encryption")}`);
    if (get("cyber_mfa"))                    lines.push(`MFA: ${get("cyber_mfa")}`);
    if (get("cyber_pen_testing"))            lines.push(`Penetration testing: ${get("cyber_pen_testing")}`);
    if (getA("cyber_certifications").length) lines.push(`Security certifications: ${getA("cyber_certifications").join(", ")}`);
  }

  if (get("additional_context")) lines.push(`\nADDITIONAL CONTEXT: ${get("additional_context")}`);

  return { description: lines.join("\n"), meta };
}

export default function AssessmentQuestionnaire({ onComplete }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep]       = useState(0);
  const [custom, setCustom]   = useState("");
  const [adding, setAdding]   = useState(false);

  const selectedDomains = (answers.domains as string[]) || [];

  const questions = ALL_QUESTIONS.filter(q =>
    !q.domains || q.domains.some(d => selectedDomains.includes(d)),
  );

  const current  = questions[step];
  const isLast   = step === questions.length - 1;
  const progress = questions.length ? Math.round((step / questions.length) * 100) : 0;
  const answer   = current ? answers[current.id] : undefined;

  const isAnswered = !current
    ? false
    : current.type === "text"
    ? !!(answer || custom)
    : current.type === "single"
    ? !!answer
    : !!(answer && (answer as string[]).length > 0);

  const canNext = isAnswered || !current?.required;

  const select = (value: string) => {
    if (!current) return;
    if (current.type === "single") {
      setAnswers(a => ({ ...a, [current.id]: value }));
    } else {
      const prev = (answers[current.id] as string[]) || [];
      const next = prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
      setAnswers(a => ({ ...a, [current.id]: next }));
    }
  };

  const isSelected = (value: string) =>
    !current
      ? false
      : current.type === "single"
      ? answer === value
      : ((answer as string[]) || []).includes(value);

  const addCustom = () => {
    if (!custom.trim() || !current) return;
    if (current.type === "text") {
      setAnswers(a => ({ ...a, [current.id]: custom }));
    } else {
      const prev = (answers[current.id] as string[]) || [];
      setAnswers(a => ({ ...a, [current.id]: [...prev, `custom:${custom}`] }));
    }
    setCustom("");
    setAdding(false);
  };

  const next = () => {
    if (!current) return;
    if (adding && custom.trim()) addCustom();
    if (current.type === "text" && custom.trim()) {
      setAnswers(a => ({ ...a, [current.id]: custom }));
    }
    if (isLast) {
      const finalAnswers = current.type === "text" && custom.trim()
        ? { ...answers, [current.id]: custom }
        : answers;
      const { description, meta } = compilePrompt(finalAnswers);
      onComplete(description, meta);
    } else {
      setStep(s => s + 1);
      setCustom("");
      setAdding(false);
    }
  };

  const back = () => {
    if (step > 0) {
      setStep(s => s - 1);
      setCustom("");
      setAdding(false);
    }
  };

  if (!current) return null;

  return (
    <div style={{ width: "100%", maxWidth: 580, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "'Sora', sans-serif" }}>
            Question {step + 1} of {questions.length}
          </span>
          {current.riskTag && (
            <span style={{ fontSize: 10, color: "var(--rh)", fontFamily: "'Sora', sans-serif", letterSpacing: ".04em", textTransform: "uppercase" }}>
              {current.riskTag}
            </span>
          )}
        </div>
        <div style={{ height: 2, background: "var(--card2)", borderRadius: 2 }}>
          <div style={{ height: 2, background: "var(--red)", borderRadius: 2, width: `${progress}%`, transition: "width 0.3s" }} />
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 500, color: "var(--fg)", letterSpacing: "-.02em", marginBottom: 5, fontFamily: "'Sora', sans-serif", lineHeight: 1.45 }}>
          {current.text}
        </h2>
        {current.sub && (
          <p style={{ fontSize: 11.5, color: "var(--fg3)", fontFamily: "'Sora', sans-serif", lineHeight: 1.55 }}>
            {current.sub}
          </p>
        )}
      </div>

      {current.options && current.type !== "text" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
          {current.options.map(opt => {
            const sel = isSelected(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => select(opt.value)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderRadius: 7, textAlign: "left",
                  border: sel ? "0.5px solid var(--red)" : "0.5px solid var(--bdr2)",
                  background: sel ? "rgba(139,26,26,0.09)" : "var(--card)",
                  cursor: "pointer", transition: "all 0.12s",
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = "var(--bdr3)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = "var(--bdr2)"; }}
              >
                <span style={{ fontSize: 13, color: sel ? "var(--fg)" : "var(--fg2)", fontFamily: "'Sora', sans-serif", letterSpacing: "-.01em" }}>
                  {opt.label}
                </span>
                {sel && <Check size={13} strokeWidth={2.5} color="var(--red)" style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}

      {current.type !== "text" && (
        <div style={{ marginBottom: 14 }}>
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11.5, color: "var(--fg3)", background: "transparent",
                border: "0.5px dashed var(--bdr2)", borderRadius: 6,
                padding: "7px 12px", cursor: "pointer", fontFamily: "'Sora', sans-serif",
              }}
            >
              <Plus size={11} strokeWidth={2} /> Add your own answer
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                autoFocus
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustom()}
                placeholder="Type your answer..."
                style={{
                  flex: 1, background: "var(--card)", border: "0.5px solid var(--bdr2)",
                  borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "var(--fg)",
                  fontFamily: "'Sora', sans-serif", outline: "none",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--bdr3)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--bdr2)"; }}
              />
              <button type="button" onClick={addCustom} style={{
                fontSize: 12, background: "var(--card2)", color: "var(--fg2)",
                border: "0.5px solid var(--bdr2)", borderRadius: 6,
                padding: "8px 12px", cursor: "pointer", fontFamily: "'Sora', sans-serif",
              }}>Add</button>
              <button type="button" onClick={() => { setAdding(false); setCustom(""); }} style={{
                fontSize: 12, background: "transparent", color: "var(--fg3)",
                border: "none", cursor: "pointer", fontFamily: "'Sora', sans-serif",
              }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {current.type === "text" && (
        <textarea
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="Type your answer..."
          rows={3}
          style={{
            width: "100%", background: "var(--card)", border: "0.5px solid var(--bdr2)",
            borderRadius: 7, padding: "10px 14px", fontSize: 13, color: "var(--fg)",
            fontFamily: "'Sora', sans-serif", letterSpacing: "-.01em", resize: "vertical",
            outline: "none", lineHeight: 1.6, marginBottom: 14,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--bdr3)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--bdr2)"; }}
        />
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {step > 0 && (
          <button type="button" onClick={back} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 13, color: "var(--fg2)", padding: "10px 16px",
            border: "0.5px solid var(--bdr2)", borderRadius: 6,
            background: "transparent", cursor: "pointer", fontFamily: "'Sora', sans-serif",
          }}>
            <ChevronLeft size={14} strokeWidth={2} /> Back
          </button>
        )}
        <button type="button" onClick={next} disabled={!canNext} style={{
          display: "inline-flex", alignItems: "center", gap: 6, flex: 1,
          justifyContent: "center", fontSize: 13, fontWeight: 500,
          background: canNext ? "var(--red)" : "var(--card2)",
          color: canNext ? "#f5f5f4" : "var(--fg4)",
          padding: "11px 22px", borderRadius: 6, border: "none",
          cursor: canNext ? "pointer" : "not-allowed",
          fontFamily: "'Sora', sans-serif", transition: "background 0.15s",
        }}>
          {isLast ? "Run assessment" : "Next"}
          {!isLast && <ChevronRight size={14} strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}
