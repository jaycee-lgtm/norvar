export type MonitoringInquirySignal = {
  id:                  string;
  provider:            string;
  source_type:         string;
  source_url:          string;
  repo_or_project:     string;
  author_external_name: string;
  title:               string;
  domains:             string[];
  severity:            string;
  signal_kind:         string;
  summary:             string;
  gaps_identified:     Array<{ gap: string; framework: string; domain: string }>;
  frameworks_cited:    string[];
};

const KIND_LABEL: Record<string, string> = {
  new_exposure:    "New exposure",
  regression:      "Regression",
  new_integration: "New integration",
};

const DOMAIN_LABEL: Record<string, string> = {
  privacy:         "Privacy",
  ai_governance:   "AI Governance",
  cybersecurity:   "Cybersecurity",
};

function formatGaps(signal: MonitoringInquirySignal): string {
  if (!signal.gaps_identified?.length) return "";
  return signal.gaps_identified
    .map(g => `- ${g.gap} (${g.framework}; ${DOMAIN_LABEL[g.domain] ?? g.domain})`)
    .join("\n");
}

export function buildMonitoringInquiryUserMessage(signal: MonitoringInquirySignal): string {
  const kind = KIND_LABEL[signal.signal_kind] ?? signal.signal_kind;
  return [
    `Review this monitoring alert and advise on compliance impact, priority, and remediation.`,
    ``,
    `Alert: ${signal.title}`,
    `Type: ${kind} · ${signal.severity} severity`,
    `Repo: ${signal.repo_or_project} (${signal.provider})`,
    ``,
    signal.summary,
    ``,
    `What should we do first, what frameworks apply, and what remediation steps do you recommend?`,
  ].join("\n");
}

export function buildMonitoringSystemContext(signal: MonitoringInquirySignal): string {
  const gaps = formatGaps(signal);
  const frameworks = signal.frameworks_cited?.length
    ? signal.frameworks_cited.join(", ")
    : "None cited";

  return [
    "",
    "MONITORING ALERT CONTEXT (Norvar Monitoring Agent — treat as authoritative background for this thread):",
    `- Signal ID: ${signal.id}`,
    `- Title: ${signal.title}`,
    `- Kind: ${KIND_LABEL[signal.signal_kind] ?? signal.signal_kind}`,
    `- Severity: ${signal.severity}`,
    `- Domains: ${signal.domains.map(d => DOMAIN_LABEL[d] ?? d).join(", ") || "Unspecified"}`,
    `- Source: ${signal.source_url}`,
    `- Repo/project: ${signal.repo_or_project}`,
    `- Author: ${signal.author_external_name}`,
    `- Frameworks cited: ${frameworks}`,
    "",
    "Summary:",
    signal.summary,
    gaps ? `\nGaps identified:\n${gaps}` : "",
    "",
    "Respond as a compliance advisor reviewing this specific alert. Be concrete about risk, regulatory hooks, and next steps. Do not ask the user to restate the alert.",
  ].join("\n");
}

export function buildMonitoringAssessmentDescription(signal: MonitoringInquirySignal): string {
  const kind = KIND_LABEL[signal.signal_kind] ?? signal.signal_kind;
  const gaps = formatGaps(signal);

  return [
    `Compliance assessment requested from a Norvar monitoring alert (${kind}, ${signal.severity} severity).`,
    ``,
    `Change: ${signal.title}`,
    `Repository: ${signal.repo_or_project}`,
    `Source: ${signal.source_url}`,
    ``,
    signal.summary,
    gaps ? `\nGaps already flagged by monitoring:\n${gaps}` : "",
    ``,
    `Assess regulatory exposure across ${signal.domains.map(d => DOMAIN_LABEL[d] ?? d).join(", ") || "relevant domains"} and produce actionable remediation guidance.`,
  ].join("\n");
}

export function mapMonitoringDomainsToAssessment(domains: string[]): string[] {
  const mapped: string[] = [];
  for (const d of domains) {
    if (d === "privacy") mapped.push("privacy");
    else if (d === "ai_governance") mapped.push("ai");
    else if (d === "cybersecurity") mapped.push("cyber");
  }
  return [...new Set(mapped)];
}

export function monitoringChatHref(signalId: string): string {
  return `/chat?monitor=${encodeURIComponent(signalId)}`;
}

export function monitoringAssessHref(signalId: string): string {
  return `/assess?monitor=${encodeURIComponent(signalId)}`;
}
