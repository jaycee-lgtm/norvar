import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { isAuditRequest } from "@/lib/audit";
import { ASSESS_AGENT } from "@/lib/agents";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_DOMAINS    = ["privacy", "ai", "cyber"];
const VALID_DATA_TYPES = ["biometric", "health", "children", "location", "financial", "behavioural", "communications", "general_pi"];
const VALID_SECTORS    = ["government", "healthcare", "finance", "hr_recruitment", "education", "transport", "media_adtech", "legal", "retail", "proptech", "technology"];
const VALID_INFER_JURISDICTIONS = [
  "eu", "uk", "us_federal", "us_state", "canada", "apac", "latam", "mena",
];

const INFER_PROMPT = `
You are ${ASSESS_AGENT.name}, a GRC analyst. A user has described a technology deployment.
Your job is to infer: domains, jurisdictions, data_types, and sector from the description.

Return ONLY valid JSON — no prose, no markdown:
{
  "domains":       { "values": [...], "confidence": "high"|"medium"|"low", "reasoning": "one sentence" },
  "jurisdictions": { "values": [...], "confidence": "high"|"medium"|"low", "reasoning": "one sentence" },
  "data_types":    { "values": [...], "confidence": "high"|"medium"|"low", "reasoning": "one sentence" },
  "sector":        { "values": [...], "confidence": "high"|"medium"|"low", "reasoning": "one sentence" }
}

Valid values only:
- domains: ${VALID_DOMAINS.join(", ")}
- jurisdictions: ${VALID_INFER_JURISDICTIONS.join(", ")}
- data_types: ${VALID_DATA_TYPES.join(", ")}
- sector: ${VALID_SECTORS.join(", ")}

Confidence rules — calibrate carefully, overconfidence is worse than underconfidence:
- "high" = explicitly stated, or an unavoidable consequence of what is described (e.g. an applicant-screening tool necessarily processes behavioural data; a hospital is necessarily healthcare sector).
- "medium" = a reasonable inference that requires an assumption (e.g. a hospital network probably involves health data, but the tool described might not touch it; a single vague mention like "uses machine learning" with no other detail). State the assumption in reasoning.
- "low" = cannot be determined from the description — set values: [] and state what is missing.
- NEVER pad values with extras that are not grounded in the description. Do not add jurisdictions, data types, or sectors "as a baseline" or "to be safe".

Domain guidance:
- privacy: any system processing personal data
- ai: any AI/ML/algorithmic system. Rule-based filters, keyword matching, and deterministic logic are NOT ai — do not flag ai for them.
- cyber: any system with network, API, or security exposure

Jurisdiction guidance:
- Use us_federal for US federal scope; us_state when US state law is implicated (e.g. BIPA/Illinois, CCPA/California, NYC LL144).
- Never return bare "us" — always us_federal and/or us_state.
- Infer ONLY from stated countries/cities, user-base locations, or company HQ. If no location signal exists, return values: [] with "low" confidence — never guess.
- Do NOT add jurisdictions merely because a company might plausibly operate there. A Germany-only description means eu only.
- If users are described as "global", include eu + us_federal with "medium" confidence.
- When HQ and user base differ (e.g. US company, Brazilian users), include both with "medium" confidence.
- When the description is partial or ambiguous, prefer "medium" or "low" confidence — never "high" unless explicitly stated or unavoidably implied.

Data type guidance:
- hiring/recruitment → behavioural
- health app → health
- payments/fintech → financial
- children's product → children
- location services → location
- employee HR records without explicit health → general_pi (not health unless clinical data stated)
- US K-12 / schools → children + general_pi
`;

// When US users are mentioned, include us_federal; add us_state if a US state is named.
function expandUsJurisdictions(values: string[], description: string): string[] {
  const out = [...values];
  const lower = description.toLowerCase();
  const usMentioned = /\b(united states|u\.s\.|usa|us-based|us company|in the us|k-12|california|illinois|texas|new york)\b/i.test(description);
  if (usMentioned && !out.includes("us_federal")) out.push("us_federal");
  if (/\b(illinois|california|texas|new york|bipa|ccpa|cpra|ll ?144)\b/i.test(lower) && !out.includes("us_state")) {
    out.push("us_state");
  }
  return out;
}

function normalizeInferredJurisdictions(field: { values?: string[] } | undefined) {
  if (!field?.values?.length) return;
  const allowedSet = new Set<string>(VALID_INFER_JURISDICTIONS);
  const expanded: string[] = [];
  for (const raw of field.values) {
    const v = raw.toLowerCase().trim();
    if (v === "us" || v === "usa" || v === "united states" || v === "us federal") {
      expanded.push("us_federal");
      continue;
    }
    if (v === "us_state" || v === "state" || v === "us state") {
      expanded.push("us_state");
      continue;
    }
    if (allowedSet.has(v)) expanded.push(v);
  }
  field.values = [...new Set(expanded)];
}

function normalizeInferredField(field: { values?: string[]; confidence?: string } | undefined) {
  if (!field) return;
  if (Array.isArray(field.values)) {
    field.values = field.values.map(v => v.toLowerCase().trim()).filter(Boolean);
  }
}

export async function POST(req: NextRequest) {
  // Allow audit runner through if secret matches, otherwise require Clerk auth
  if (!isAuditRequest(req)) {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { description } = await req.json();
  if (!description || description.trim().length < 10) {
    return Response.json({ error: "Description too short" }, { status: 400 });
  }

  const response = await claude.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system:     INFER_PROMPT,
    messages:   [{ role: "user", content: description }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract the JSON object even if the model wraps it in fences or prose.
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  const clean = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();

  try {
    const inferred = JSON.parse(clean) as {
      jurisdictions?: { values?: string[] };
      domains?: { values?: string[] };
      data_types?: { values?: string[] };
      sector?: { values?: string[] };
    };
    normalizeInferredJurisdictions(inferred.jurisdictions);
    if (inferred.jurisdictions?.values) {
      inferred.jurisdictions.values = expandUsJurisdictions(inferred.jurisdictions.values, description);
    }
    normalizeInferredField(inferred.domains);
    normalizeInferredField(inferred.data_types);
    normalizeInferredField(inferred.sector);
    return Response.json({ inferred });
  } catch {
    return Response.json({ error: "Failed to parse inference" }, { status: 500 });
  }
}
