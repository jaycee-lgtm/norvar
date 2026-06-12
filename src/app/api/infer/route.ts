import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { isAuditRequest } from "@/lib/audit";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_DOMAINS       = ["privacy", "ai", "cyber"];
const VALID_JURISDICTIONS = ["eu", "us_federal", "us_state", "uk", "canada", "apac", "latam", "mena"];
const VALID_DATA_TYPES    = ["biometric", "health", "children", "location", "financial", "behavioural", "communications", "general_pi"];
const VALID_SECTORS       = ["government", "healthcare", "finance", "hr_recruitment", "education", "transport", "media_adtech", "legal", "retail", "proptech", "technology"];

const INFER_PROMPT = `
You are a GRC analyst. A user has described a technology deployment.
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
- jurisdictions: ${VALID_JURISDICTIONS.join(", ")}
- data_types: ${VALID_DATA_TYPES.join(", ")}
- sector: ${VALID_SECTORS.join(", ")}

Confidence rules:
- "high" = clearly stated or strongly implied
- "medium" = reasonably inferred but not explicit — state assumption in reasoning
- "low" = cannot be determined — set values: [] and state what is missing

Domain guidance:
- privacy: any system processing personal data
- ai: any AI/ML/algorithmic system
- cyber: any system with network, API, or security exposure

Jurisdiction guidance:
- Infer from country/city mentions, user base hints, or company HQ signals
- If users are "global" include eu + us_federal as baseline

Data type guidance:
- hiring/recruitment → behavioural
- health app → health
- payments/fintech → financial
- children's product → children
- location services → location
`;

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

  try {
    const clean    = raw.replace(/```json\s*/i, "").replace(/```\s*$/, "").trim();
    const inferred = JSON.parse(clean);
    return Response.json({ inferred });
  } catch {
    return Response.json({ error: "Failed to parse inference" }, { status: 500 });
  }
}
