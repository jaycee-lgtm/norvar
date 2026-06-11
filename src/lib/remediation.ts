export const SEV_RANK: Record<string, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
};

export function sortBySeverity<T extends { gap_severity: string; created_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = SEV_RANK[a.gap_severity] ?? 99;
    const sb = SEV_RANK[b.gap_severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export const STATUS_LABELS: Record<string, string> = {
  open:        "Open",
  in_progress: "In progress",
  escalated:   "Escalated",
  resolved:    "Resolved",
  wont_fix:    "Won't fix",
};

export const STATUS_STYLES: Record<string, { bg: string; color: string; bdr: string }> = {
  open:        { bg: "rgba(245,245,244,.08)", color: "var(--fg)",   bdr: "var(--bdr2)" },
  in_progress: { bg: "rgba(59,109,17,.12)",   color: "var(--rl)",   bdr: "var(--rl-bdr)" },
  escalated:   { bg: "var(--rm-bg)",          color: "var(--rm)",   bdr: "var(--rm-bdr)" },
  resolved:    { bg: "var(--rl-bg)",          color: "var(--rl)",   bdr: "var(--rl-bdr)" },
  wont_fix:    { bg: "var(--card2)",          color: "var(--fg3)",  bdr: "var(--bdr2)" },
};

export type RemediationStatus = keyof typeof STATUS_LABELS;
