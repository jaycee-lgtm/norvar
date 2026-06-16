import { gapKeyFromTitle } from "@/lib/gap-chat";
import { GAP_DOMAIN_CODES, normalizeRiskDomainKey, type RiskDomainKey } from "@/lib/risk-tiers";

export { GAP_DOMAIN_CODES };

const GAP_ID_PATTERN = /^NRV-\d{4}-\d{4}-[A-Z]+-\d+$/;
const GAP_NUMBER_PATTERN = /^[A-Z]+-\d+$/;

export function gapDomainCode(domain: string): string {
  return GAP_DOMAIN_CODES[normalizeRiskDomainKey(domain)];
}

export function formatGapNumber(domain: string, index: number): string {
  return `${gapDomainCode(domain)}-${index}`;
}

export function formatGapId(
  assessmentNumber: string | null | undefined,
  domain: string,
  index: number,
): string | null {
  if (!assessmentNumber) return null;
  return `${assessmentNumber}-${formatGapNumber(domain, index)}`;
}

export function isCanonicalGapId(key: string | null | undefined): boolean {
  return Boolean(key && GAP_ID_PATTERN.test(key));
}

export type GapForId = { domain: string };

export type GapIdInfo = {
  gap_number: string;
  gap_id:     string | null;
  gap_key:    string;
};

/** Assign per-domain sequential gap numbers (1-based) in array order. */
export function assignGapNumbers<T extends GapForId>(gaps: T[]): Map<number, string> {
  const counters: Partial<Record<RiskDomainKey, number>> = {};
  const result = new Map<number, string>();
  gaps.forEach((gap, i) => {
    const domainKey = normalizeRiskDomainKey(gap.domain);
    const next = (counters[domainKey] ?? 0) + 1;
    counters[domainKey] = next;
    result.set(i, formatGapNumber(gap.domain, next));
  });
  return result;
}

export function assignGapIds<T extends GapForId>(
  gaps: T[],
  assessmentNumber: string | null | undefined,
): Map<number, GapIdInfo> {
  const numbers = assignGapNumbers(gaps);
  const result = new Map<number, GapIdInfo>();
  gaps.forEach((gap, i) => {
    const gap_number = numbers.get(i)!;
    const gap_id = assessmentNumber ? `${assessmentNumber}-${gap_number}` : null;
    const gap_key = gap_id ?? gap_number;
    result.set(i, { gap_number, gap_id, gap_key });
  });
  return result;
}

export function parseGapNumberFromKey(
  gapKey: string | null | undefined,
  assessmentNumber: string | null | undefined,
): string | null {
  if (!gapKey) return null;
  if (GAP_NUMBER_PATTERN.test(gapKey)) return gapKey;
  if (assessmentNumber && gapKey.startsWith(`${assessmentNumber}-`)) {
    const suffix = gapKey.slice(assessmentNumber.length + 1);
    return GAP_NUMBER_PATTERN.test(suffix) ? suffix : null;
  }
  const match = gapKey.match(/^NRV-\d{4}-\d{4}-([A-Z]+-\d+)$/);
  return match?.[1] ?? null;
}

export function resolveGapId(
  assessmentNumber: string | null | undefined,
  gapNumber: string | null | undefined,
  gapKey: string | null | undefined,
): string | null {
  if (gapKey && isCanonicalGapId(gapKey)) return gapKey;
  if (assessmentNumber && gapNumber && GAP_NUMBER_PATTERN.test(gapNumber)) {
    return `${assessmentNumber}-${gapNumber}`;
  }
  const parsed = parseGapNumberFromKey(gapKey, assessmentNumber);
  if (assessmentNumber && parsed) return `${assessmentNumber}-${parsed}`;
  return null;
}

export function resolveGapKey(
  gapKey: string | null | undefined,
  gapNumber: string | null | undefined,
  assessmentNumber: string | null | undefined,
  domain: string,
  severity: string,
  title: string,
  legacyIndex?: string | number,
): string {
  const resolved = resolveGapId(assessmentNumber, gapNumber, gapKey);
  if (resolved) return resolved;
  if (gapKey) return gapKey;
  if (legacyIndex !== undefined) return String(legacyIndex);
  return gapKeyFromTitle(title, severity);
}

export function lookupGapChat<T>(
  gapChats: Record<string, T[]> | null | undefined,
  gapKey: string,
  legacyKeys: string[] = [],
): T[] {
  if (!gapChats) return [];
  if (Array.isArray(gapChats[gapKey])) return gapChats[gapKey];
  for (const key of legacyKeys) {
    if (Array.isArray(gapChats[key])) return gapChats[key];
  }
  return [];
}

type RemediationGapRow = {
  assessment_id:     string;
  assessment_number: string | null;
  gap_domain?:       string;
  gap_number:        string | null;
  gap_key:           string | null;
  gap_title:         string;
  gap_severity:      string;
  created_at:        string;
};

function maxIndexFromGapNumber(
  gapNumber: string,
  domain: string,
): { domainKey: RiskDomainKey; index: number } | null {
  if (!GAP_NUMBER_PATTERN.test(gapNumber)) return null;
  const index = parseInt(gapNumber.split("-").pop()!, 10);
  if (!Number.isFinite(index)) return null;
  return { domainKey: normalizeRiskDomainKey(domain), index };
}

export function existingDomainCounters(
  rows: Array<Pick<RemediationGapRow, "gap_number" | "gap_domain" | "gap_key" | "assessment_number">>,
): Partial<Record<RiskDomainKey, number>> {
  const counters: Partial<Record<RiskDomainKey, number>> = {};
  for (const row of rows) {
    const gapNumber = row.gap_number
      ?? parseGapNumberFromKey(row.gap_key, row.assessment_number);
    if (!gapNumber) continue;
    const parsed = maxIndexFromGapNumber(gapNumber, row.gap_domain ?? "privacy");
    if (!parsed) continue;
    counters[parsed.domainKey] = Math.max(counters[parsed.domainKey] ?? 0, parsed.index);
  }
  return counters;
}

export function assignNextGapIds<T extends GapForId>(
  gaps: T[],
  assessmentNumber: string | null | undefined,
  existingCounters: Partial<Record<RiskDomainKey, number>>,
): GapIdInfo[] {
  const counters = { ...existingCounters };
  return gaps.map(gap => {
    const domainKey = normalizeRiskDomainKey(gap.domain);
    const next = (counters[domainKey] ?? 0) + 1;
    counters[domainKey] = next;
    const gap_number = formatGapNumber(gap.domain, next);
    const gap_id = assessmentNumber ? `${assessmentNumber}-${gap_number}` : null;
    const gap_key = gap_id ?? gap_number;
    return { gap_number, gap_id, gap_key };
  });
}

export function enrichRemediationGapIds<T extends RemediationGapRow>(
  items: T[],
): Array<T & { gap_id: string | null; gap_key: string }> {
  const byAssessment = new Map<string, T[]>();
  for (const item of items) {
    const group = byAssessment.get(item.assessment_id) ?? [];
    group.push(item);
    byAssessment.set(item.assessment_id, group);
  }

  for (const group of byAssessment.values()) {
    const counters = existingDomainCounters(group);

    const unassigned = group
      .filter(item => {
        const n = item.gap_number ?? parseGapNumberFromKey(item.gap_key, item.assessment_number);
        return !n || !GAP_NUMBER_PATTERN.test(n);
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    for (const item of unassigned) {
      const domainKey = normalizeRiskDomainKey(item.gap_domain ?? "privacy");
      const next = (counters[domainKey] ?? 0) + 1;
      counters[domainKey] = next;
      item.gap_number = formatGapNumber(item.gap_domain ?? "privacy", next);
    }
  }

  return items.map(item => {
    const gap_number = item.gap_number
      ?? parseGapNumberFromKey(item.gap_key, item.assessment_number);
    const gap_id = resolveGapId(item.assessment_number, gap_number, item.gap_key);
    const gap_key = resolveGapKey(
      item.gap_key,
      gap_number,
      item.assessment_number,
      item.gap_domain ?? "privacy",
      item.gap_severity,
      item.gap_title,
    );
    return {
      ...item,
      gap_number: gap_number ?? item.gap_number,
      gap_id,
      gap_key,
    };
  });
}
