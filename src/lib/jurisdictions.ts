/** Chip labels for contracts / draft jurisdiction pickers. */
export const JURISDICTION_CHIP_OPTIONS = [
  "EU",
  "UK",
  "US",
  "Canada",
  "Australia",
  "Singapore",
  "UAE",
  "Brazil",
  "India",
  "Global",
] as const;

/** Assessment / scoping jurisdiction values. */
export const ASSESSMENT_JURISDICTION_OPTIONS = [
  { value: "eu",     label: "EU / EEA"      },
  { value: "uk",     label: "UK"            },
  { value: "us",     label: "US"            },
  { value: "canada", label: "Canada"        },
  { value: "apac",   label: "Asia-Pacific"  },
  { value: "africa", label: "Africa"        },
  { value: "latam",  label: "Latin America" },
  { value: "mena",   label: "MENA"          },
  { value: "global", label: "Global"        },
] as const;

export type AssessmentJurisdiction = typeof ASSESSMENT_JURISDICTION_OPTIONS[number]["value"];

export const VALID_INFER_JURISDICTIONS = ASSESSMENT_JURISDICTION_OPTIONS
  .map(o => o.value)
  .filter(v => v !== "global");

export function normalizeJurisdictionValue(value: string): string {
  if (value === "us_federal" || value === "us_state") return "us";
  return value;
}

export function jurisdictionLabel(value: string): string {
  const normalized = normalizeJurisdictionValue(value);
  const match = ASSESSMENT_JURISDICTION_OPTIONS.find(o => o.value === normalized);
  if (match) return match.label;
  if (value === "us_federal" || value === "us_state") return "US";
  return value;
}

export function normalizeJurisdictionList(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = normalizeJurisdictionValue(raw);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
