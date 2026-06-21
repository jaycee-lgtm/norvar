// Shared classification engine for the Norvar Monitoring Agent.
// Called by all three connector webhook handlers (GitHub, GitLab, Jira)
// with a normalised "signal candidate" — the connector-specific code
// is responsible for turning a webhook payload into this shape.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type MonitoringProvider = "github" | "gitlab" | "jira";
export type MonitoringSourceType = "push" | "pull_request" | "merge_request" | "jira_ticket";

export type SignalCandidate = {
  orgId:              string;
  provider:           MonitoringProvider;
  sourceType:         MonitoringSourceType;
  sourceUrl:          string;
  sourceId:           string;
  repoOrProject:      string;
  authorExternalId:   string;
  authorExternalName: string;
  authorEmail:        string | null;
  title:              string;
  contentExcerpt:     string;
};

export type SignalDomain = "privacy" | "ai_governance" | "cybersecurity";
export type SignalSeverity = "high" | "medium" | "low" | "none";
export type SignalKind = "new_exposure" | "regression" | "new_integration" | "none";

export type ClassificationResult = {
  domains:         SignalDomain[];
  severity:        SignalSeverity;
  confidence:      "high" | "medium" | "low";
  signal_kind:     SignalKind;
  summary:         string;
  gaps_identified: Array<{ gap: string; framework: string; domain: SignalDomain }>;
  frameworks_cited: string[];
  reasoning:       string;
};

// ─── CLASSIFICATION PROMPT ───────────────────────────────────────────────────

const MONITORING_SYSTEM_PROMPT = `
You are the classification engine for Norvar's Monitoring Agent. Your job is to look at a code change or ticket and decide whether it has compliance implications across Privacy, AI Governance, or Cybersecurity — and if so, how serious.

WHAT YOU ARE LOOKING FOR:

1. NEW EXPOSURE — a new capability was added that touches a regulated area.
   Examples: new database field storing personal data, new biometric collection, new third-party AI model integration, new data export feature, new tracking/analytics pixel, new geographic data flow.

2. REGRESSION — something that previously provided protection was removed or weakened.
   Examples: cookie consent banner removed or bypassed, encryption disabled or downgraded, a privacy policy link removed from a page, an access control check removed, an audit log call deleted, a data retention/deletion job removed or disabled.

3. NEW INTEGRATION — a new third-party service or vendor was introduced that will process data.
   Examples: new SDK for an analytics platform, new AI API integration (OpenAI, Anthropic, etc.), new payment processor, new CRM or marketing tool connection.

If none of these apply, classify as signal_kind "none" with severity "none" — most changes are NOT compliance-relevant and should be classified this way. Do not manufacture signals from routine code changes, bug fixes, refactors, or UI styling that doesn't touch the above.

SEVERITY GUIDANCE:
- high: regression removing an existing protection, or new exposure involving sensitive categories (health, biometric, children's data, financial), or new AI integration making automated decisions about people
- medium: new exposure involving standard personal data, new third-party integration with unclear data handling, ambiguous regression
- low: minor new exposure, internal-only data, low-risk integration
- none: not compliance-relevant

CORPUS — ONLY CITE FROM THIS LIST:
Privacy: GDPR, UK GDPR, CCPA/CPRA, HIPAA, BIPA, COPPA, FERPA, LGPD, PDPA, PIPEDA, Quebec Law 25, PIPL, APPI, PIPA, DPDPA, POPIA, UAE DPL, KSA PDPL, ePrivacy, SCCs, EU-US DPF, CA ADMT Regs, NYC LL144, Colorado AI Act.
AI Governance: EU AI Act, EU AI Act Art. 5, EU AI Act Annex III, GDPR Art. 22, NIST AI RMF, ISO 42001, FTC AI Guidance.
Cybersecurity: NIS2, DORA, ISO 27001, SOC 2, NIST CSF 2.0, PCI DSS.

OUTPUT FORMAT — JSON only, no prose, no markdown:
{
  "domains":          ["privacy"],
  "severity":         "high" | "medium" | "low" | "none",
  "confidence":       "high" | "medium" | "low",
  "signal_kind":      "new_exposure" | "regression" | "new_integration" | "none",
  "summary":          "2-3 sentences plain English — what changed and why it matters",
  "gaps_identified":  [{ "gap": "plain English gap description", "framework": "corpus framework", "domain": "privacy" }],
  "frameworks_cited": ["frameworks from corpus only"],
  "reasoning":        "1-2 sentences — why you classified it this way, for audit purposes"
}

Be conservative. A false "none" is far better than crying wolf on routine commits. Only flag genuine compliance-relevant changes.
`;

// ─── CLASSIFY A SIGNAL ────────────────────────────────────────────────────────

export async function classifySignal(candidate: SignalCandidate): Promise<ClassificationResult> {
  const userMsg = [
    `Source: ${candidate.provider} ${candidate.sourceType}`,
    `Repo/Project: ${candidate.repoOrProject}`,
    `Title: ${candidate.title}`,
    ``,
    `Content:`,
    candidate.contentExcerpt.slice(0, 6000),
  ].join("\n");

  const response = await claude.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1500,
    system:     MONITORING_SYSTEM_PROMPT,
    messages:   [{ role: "user", content: userMsg }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const clean = raw.trim().replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
  const start = clean.indexOf("{");
  if (start < 0) throw new Error("No JSON in classification response");

  return JSON.parse(clean.slice(start)) as ClassificationResult;
}

// ─── RESOLVE NORVAR USER FROM EXTERNAL IDENTITY ──────────────────────────────

export async function resolveNorvarUser(
  orgId: string,
  provider: MonitoringProvider,
  externalId: string,
): Promise<{ userId: string | null; email: string | null }> {
  const { data } = await supabase
    .from("monitoring_user_mapping")
    .select("norvar_user_id, norvar_email")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .eq("external_id", externalId)
    .maybeSingle();

  return {
    userId: data?.norvar_user_id ?? null,
    email:  data?.norvar_email ?? null,
  };
}

// ─── RESOLVE COMPLIANCE CONTACT FOR DOMAIN ───────────────────────────────────

export async function resolveComplianceContact(
  orgId: string,
  domain: SignalDomain,
): Promise<{ userId: string | null; email: string | null; adminEmail: string | null }> {
  const { data } = await supabase
    .from("org_monitoring_config")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!data) return { userId: null, email: null, adminEmail: null };

  const map: Record<SignalDomain, { userId: string | null; email: string | null }> = {
    privacy:       { userId: data.privacy_contact_user_id,       email: data.privacy_contact_email },
    ai_governance: { userId: data.ai_governance_contact_user_id, email: data.ai_governance_contact_email },
    cybersecurity: { userId: data.cybersecurity_contact_user_id, email: data.cybersecurity_contact_email },
  };

  return { ...map[domain], adminEmail: data.admin_email };
}

// ─── PERSIST A SIGNAL ─────────────────────────────────────────────────────────

export async function saveSignal(
  candidate: SignalCandidate,
  classification: ClassificationResult,
  resolvedAuthor: { userId: string | null; email: string | null },
): Promise<string | null> {
  if (classification.signal_kind === "none" && classification.severity === "none") {
    return null;
  }

  const { data, error } = await supabase
    .from("monitoring_signals")
    .insert({
      org_id:                candidate.orgId,
      provider:              candidate.provider,
      source_type:           candidate.sourceType,
      source_url:            candidate.sourceUrl,
      source_id:             candidate.sourceId,
      repo_or_project:       candidate.repoOrProject,
      author_external_id:    candidate.authorExternalId,
      author_external_name:  candidate.authorExternalName,
      author_norvar_user_id: resolvedAuthor.userId,
      author_email:          resolvedAuthor.email ?? candidate.authorEmail,
      title:                 candidate.title,
      content_excerpt:       candidate.contentExcerpt.slice(0, 4000),
      domains:               classification.domains,
      severity:              classification.severity,
      confidence:            classification.confidence,
      signal_kind:           classification.signal_kind,
      summary:               classification.summary,
      gaps_identified:       classification.gaps_identified,
      frameworks_cited:      classification.frameworks_cited,
      reasoning:             classification.reasoning,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save monitoring signal:", error);
    throw new Error(`Failed to save monitoring signal: ${error.message}`);
  }
  if (!data?.id) throw new Error("Failed to save monitoring signal");
  return data.id;
}

// ─── LOG RAW WEBHOOK (for debugging / replay) ────────────────────────────────

export async function logWebhook(
  provider: MonitoringProvider,
  orgId: string | null,
  eventType: string,
  payload: unknown,
  processed: boolean,
  errorMessage?: string,
) {
  await supabase.from("monitoring_webhook_log").insert({
    provider,
    org_id:        orgId,
    event_type:    eventType,
    payload:       payload as object,
    processed,
    error_message: errorMessage ?? null,
  });
}
