import { GAP_SEV_RANK, normalizeGapSeverity, normalizeRiskTier, type GapSeverity } from "@/lib/risk-tiers";

export type StreamGap = {
  severity:    string;
  domain:      string;
  title:       string;
  detail:      string;
  remediation: string;
  frameworks:  string[];
};

function findMatchingBrace(s: string, start: number): number {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      esc = c === "\\" && !esc;
      if (!esc && c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

export function normalizeStreamGap(raw: Record<string, unknown>): StreamGap {
  const domain = String(raw.domain || "privacy").toLowerCase();
  return {
    severity:    normalizeGapSeverity(String(raw.severity || "medium")),
    domain:      domain === "ai" || domain === "ai_governance"
      ? "ai_governance"
      : domain === "cyber" || domain === "cybersecurity"
        ? "cybersecurity"
        : "privacy",
    title:       String(raw.title || "Compliance gap"),
    detail:      String(raw.detail || raw.description || ""),
    remediation: String(raw.remediation || raw.fix || ""),
    frameworks:  Array.isArray(raw.frameworks) ? raw.frameworks.map(String) : [],
  };
}

export function deriveRiskFromGaps(gaps: Array<{ severity: string; domain: string }>) {
  const domains = ["privacy", "ai_governance", "cybersecurity"];

  const maxSeverity = gaps.reduce((max, g) => {
    const rank = GAP_SEV_RANK[normalizeGapSeverity(g.severity)] ?? 0;
    return rank > max ? rank : max;
  }, 0);

  const overallTier: GapSeverity =
    maxSeverity >= 3 ? "high" :
    maxSeverity >= 2 ? "medium" : "low";

  const byDomain: Record<string, { tier: GapSeverity; gap_count: number }> = {};
  for (const domain of domains) {
    const domainGaps = gaps.filter(g => g.domain === domain);
    const domainMax  = domainGaps.reduce((max, g) => {
      const rank = GAP_SEV_RANK[normalizeGapSeverity(g.severity)] ?? 0;
      return rank > max ? rank : max;
    }, 0);
    byDomain[domain] = {
      tier: domainMax >= 3 ? "high" : domainMax >= 2 ? "medium" : "low",
      gap_count: domainGaps.length,
    };
  }

  return { overall: overallTier, byDomain };
}

export class AssessmentGapStreamParser {
  private buffer = "";
  private emitted = 0;
  private gapsBracket = -1;

  append(text: string) {
    this.buffer += text;
    if (this.gapsBracket < 0) {
      const key = this.buffer.indexOf('"gaps"');
      if (key < 0) return;
      const bracket = this.buffer.indexOf("[", key);
      if (bracket < 0) return;
      this.gapsBracket = bracket;
    }
  }

  drainNewGaps(): StreamGap[] {
    if (this.gapsBracket < 0) return [];

    const found: StreamGap[] = [];
    let i = this.gapsBracket + 1;

    while (i < this.buffer.length) {
      while (i < this.buffer.length && /[\s,]/.test(this.buffer[i])) i++;
      if (i >= this.buffer.length) break;
      if (this.buffer[i] === "]") break;
      if (this.buffer[i] !== "{") break;

      const end = findMatchingBrace(this.buffer, i);
      if (end < 0) break;

      const slice = this.buffer.slice(i, end + 1);
      try {
        const parsed = JSON.parse(slice) as Record<string, unknown>;
        found.push(normalizeStreamGap(parsed));
      } catch {
        break;
      }
      i = end + 1;
    }

    const newOnes = found.slice(this.emitted);
    this.emitted = found.length;
    return newOnes;
  }

  getBuffer() {
    return this.buffer;
  }
}

export function buildProcessingResult(
  gaps: StreamGap[],
  opts?: {
    title?:      string;
    summary?:    string;
    frameworks?: string[];
    status?:     "processing" | "partial" | "complete" | "failed";
  },
) {
  const risk = deriveRiskFromGaps(gaps);
  return {
    status:          opts?.status ?? "processing",
    title:           opts?.title ?? "Compliance assessment",
    summary:         opts?.summary ?? "",
    frameworks:      opts?.frameworks ?? [],
    gaps,
    risk_tier:       risk.overall,
    risk_by_domain:  risk.byDomain,
  };
}
