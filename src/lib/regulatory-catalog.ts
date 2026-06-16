import catalogData from "../../data/regulatory-catalog.json";

export type CatalogDomain = "privacy" | "ai" | "cyber";
export type CatalogStatus = "in_force" | "advancing" | "upcoming" | "watch";

export type RegulatoryCatalogEntry = {
  id:                string;
  abbr:              string;
  name:              string;
  domain:            CatalogDomain;
  jurisdiction:      string;
  jurisdictionLabel: string;
  status:            CatalogStatus;
  year:              number | null;
  sourceUrl:         string;
  notes:             string;
  corpus:            "global" | "us";
};

export const REGULATORY_CATALOG = catalogData as RegulatoryCatalogEntry[];

export const CATALOG_DOMAIN_ORDER: CatalogDomain[] = ["privacy", "ai", "cyber"];

export const CATALOG_DOMAIN_LABELS: Record<CatalogDomain, string> = {
  privacy: "Privacy",
  ai:      "AI governance",
  cyber:   "Cybersecurity",
};

export const CATALOG_STATUS_LABELS: Record<CatalogStatus, string> = {
  in_force:  "In force",
  advancing: "Advancing",
  upcoming:  "Upcoming",
  watch:     "Watch",
};

export type CatalogGroup = {
  domain:        CatalogDomain;
  domainLabel:   string;
  jurisdictions: {
    label:      string;
    frameworks: RegulatoryCatalogEntry[];
  }[];
};

/** Group catalog entries by domain, then jurisdiction label (preserving export sort). */
export function groupCatalog(entries: RegulatoryCatalogEntry[] = REGULATORY_CATALOG): CatalogGroup[] {
  const byDomain = new Map<CatalogDomain, Map<string, RegulatoryCatalogEntry[]>>();

  for (const entry of entries) {
    if (!byDomain.has(entry.domain)) byDomain.set(entry.domain, new Map());
    const byJurisdiction = byDomain.get(entry.domain)!;
    if (!byJurisdiction.has(entry.jurisdictionLabel)) {
      byJurisdiction.set(entry.jurisdictionLabel, []);
    }
    byJurisdiction.get(entry.jurisdictionLabel)!.push(entry);
  }

  return CATALOG_DOMAIN_ORDER
    .filter(domain => byDomain.has(domain))
    .map(domain => ({
      domain,
      domainLabel: CATALOG_DOMAIN_LABELS[domain],
      jurisdictions: [...byDomain.get(domain)!.entries()].map(([label, frameworks]) => ({
        label,
        frameworks,
      })),
    }));
}

export function getCatalogEntryByAbbr(abbr: string): RegulatoryCatalogEntry | undefined {
  const needle = abbr.trim().toLowerCase();
  return REGULATORY_CATALOG.find(
    f => f.abbr.toLowerCase() === needle || f.name.toLowerCase() === needle,
  );
}

/** Merge top-level and per-gap framework refs into a stable deduped list. */
export function aggregateAssessmentFrameworks(
  gaps: Array<{ frameworks?: string[] | null }>,
  topLevel?: string[] | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const ref of topLevel ?? []) add(ref);
  for (const gap of gaps) {
    for (const ref of gap.frameworks ?? []) add(ref);
  }

  return out;
}

/** Best-effort catalog match for free-text framework references in gap output. */
export function resolveCatalogEntryForFrameworkRef(ref: string): RegulatoryCatalogEntry | undefined {
  const trimmed = ref.trim();
  if (!trimmed) return undefined;

  const direct = getCatalogEntryByAbbr(trimmed);
  if (direct) return direct;

  const needle = trimmed.toLowerCase();
  const matches = REGULATORY_CATALOG
    .filter(f => needle.includes(f.abbr.toLowerCase()) || f.abbr.toLowerCase().includes(needle))
    .sort((a, b) => b.abbr.length - a.abbr.length);

  return matches[0];
}

export function getCatalogEntryById(id: string): RegulatoryCatalogEntry | undefined {
  return REGULATORY_CATALOG.find(f => f.id === id);
}

export function filterCatalogEntries(
  search: string,
  domain: CatalogDomain | "all",
): RegulatoryCatalogEntry[] {
  const q = search.trim().toLowerCase();
  return REGULATORY_CATALOG.filter(entry => {
    if (domain !== "all" && entry.domain !== domain) return false;
    if (!q) return true;
    return (
      entry.abbr.toLowerCase().includes(q) ||
      entry.name.toLowerCase().includes(q) ||
      entry.jurisdictionLabel.toLowerCase().includes(q) ||
      entry.notes.toLowerCase().includes(q)
    );
  });
}

/** Match RAG chunks or assessment framework strings against catalog abbreviations. */
export function matchesSelectedFramework(
  regAbbr: string,
  selectedAbbrs: string[] | null | undefined,
): boolean {
  if (!selectedAbbrs?.length) return true;
  const needle = regAbbr.trim().toLowerCase();
  return selectedAbbrs.some(sel => {
    const s = sel.trim().toLowerCase();
    return s === needle || needle.includes(s) || s.includes(needle);
  });
}

export function buildFrameworkScopePrompt(selectedAbbrs: string[] | null | undefined): string {
  if (!selectedAbbrs?.length) return "";
  const names = selectedAbbrs
    .map(abbr => getCatalogEntryByAbbr(abbr)?.abbr ?? abbr)
    .join(", ");
  return (
    `USER FRAMEWORK SCOPE: The user has limited output to these frameworks only — ` +
    `cite and apply ONLY regulations from this list (do not introduce others unless ` +
    `the user explicitly asks): ${names}.`
  );
}

export const ALL_CATALOG_ABBRS = REGULATORY_CATALOG.map(f => f.abbr);
