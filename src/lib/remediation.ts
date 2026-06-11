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
