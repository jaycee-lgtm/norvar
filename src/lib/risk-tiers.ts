export type RiskTier = "high" | "medium" | "low";
export type GapSeverity = "high" | "medium" | "low";

/** Map legacy "critical" values to high; default unknown tiers to low. */
export function normalizeRiskTier(tier: string | null | undefined): RiskTier {
  const t = (tier ?? "low").toLowerCase();
  if (t === "critical" || t === "high") return "high";
  if (t === "medium") return "medium";
  return "low";
}

/** Map legacy "critical" severities to high. */
export function normalizeGapSeverity(severity: string | null | undefined): GapSeverity {
  const s = (severity ?? "medium").toLowerCase();
  if (s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

export const GAP_SEV_RANK: Record<GapSeverity, number> = {
  high:   3,
  medium: 2,
  low:    1,
};

const RISK_DOMAIN_KEYS = ["privacy", "ai_governance", "cybersecurity"] as const;
export type RiskDomainKey = typeof RISK_DOMAIN_KEYS[number];

/** Normalize questionnaire / API domain ids to risk_by_domain keys. */
export function normalizeRiskDomainKey(domain: string): RiskDomainKey {
  const d = domain.toLowerCase();
  if (d === "ai" || d === "ai_governance") return "ai_governance";
  if (d === "cyber" || d === "cybersecurity") return "cybersecurity";
  return "privacy";
}

export function normalizeScopedRiskDomains(domains: string[] | undefined | null): RiskDomainKey[] {
  if (!domains?.length) return [];
  return [...new Set(domains.map(normalizeRiskDomainKey))];
}
