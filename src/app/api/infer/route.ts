import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { isAuditRequest } from "@/lib/audit";
import { ASSESS_AGENT } from "@/lib/agents";
import {
  VALID_INFER_JURISDICTIONS,
  normalizeJurisdictionList,
} from "@/lib/jurisdictions";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_DOMAINS    = ["privacy", "ai", "cyber"];
const VALID_DATA_TYPES = ["biometric", "health", "children", "location", "financial", "behavioural", "communications", "general_pi"];
const VALID_SECTORS    = ["government", "healthcare", "finance", "hr_recruitment", "education", "transport", "media_adtech", "legal", "retail", "proptech", "technology"];

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
- Infer ONLY from stated countries/cities, user-base locations, or company HQ. If no location signal exists, return values: [] with "low" confidence — never guess.
- Do NOT add us (or any jurisdiction) merely because a company might plausibly operate there. A Germany-only description means eu only.
- If users are described as "global", include eu + us as the baseline with "medium" confidence.
- When HQ and user base differ (e.g. US company, Brazilian users), include both with "medium" confidence.

Data type guidance:
- hiring/recruitment → behavioural
- health app → health
- payments/fintech → financial
- children's product → children
- location services → location
`;

function normalizeInferredJurisdictions(field: { values?: string[] } | undefined) {
  if (!field?.values?.length) return;
  const allowedSet = new Set<string>(VALID_INFER_JURISDICTIONS);
  field.values = normalizeJurisdictionList(field.values).filter(v => allowedSet.has(v));
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
    return Response.json({ inferred });
  } catch {
    return Response.json({ error: "Failed to parse inference" }, { status: 500 });
  }
}
