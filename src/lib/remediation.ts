import { compareGapSeverity } from "@/lib/risk-tiers";

export function sortBySeverity<T extends { gap_severity: string; created_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const bySev = compareGapSeverity(a.gap_severity, b.gap_severity);
    if (bySev !== 0) return bySev;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export const STATUS_LABELS = {
  open:        "Open",
  in_progress: "In progress",
  escalated:   "Escalated",
  resolved:    "Resolved",
  wont_fix:    "Won't fix",
} as const;

export type RemediationStatus = keyof typeof STATUS_LABELS;

export const STATUS_STYLES: Record<RemediationStatus, { bg: string; color: string; bdr: string }> = {
  open:        { bg: "rgba(245,245,244,.08)", color: "var(--fg)",   bdr: "var(--bdr2)" },
  in_progress: { bg: "rgba(59,109,17,.12)",   color: "var(--rl)",   bdr: "var(--rl-bdr)" },
  escalated:   { bg: "var(--rm-bg)",          color: "var(--rm)",   bdr: "var(--rm-bdr)" },
  resolved:    { bg: "var(--rl-bg)",          color: "var(--rl)",   bdr: "var(--rl-bdr)" },
  wont_fix:    { bg: "var(--card2)",          color: "var(--fg3)",  bdr: "var(--bdr2)" },
};
