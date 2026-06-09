import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { VoyageAIClient } from "voyageai";

// ── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a senior Governance, Risk and Compliance analyst specialising in technology regulation
across AI, privacy, cybersecurity, computer vision, automated decisioning, and robotics, globally.

A user will describe a product or deployment and receive relevant regulatory clauses.
Analyse the deployment and return ONLY valid JSON, no preamble, no markdown fences.

Return this exact structure:

{
  "title": "short title describing the deployment (max 8 words)",
  "summary": "two sentence plain English summary of compliance position and most urgent priorities",
  "risk": "high" | "med" | "low",
  "risk_summary": "one sentence explaining the overall risk level",
  "frameworks": ["array of applicable framework abbreviations as strings"],
  "gaps": [
    {
      "severity": "critical" | "high" | "medium",
      "title": "short gap title",
      "detail": "what the requirement is and how the deployment falls short, cite specific article numbers",
      "frameworks": ["framework abbreviations for this gap"],
      "remediation": "specific actionable fix, what to build, change, or document"
    }
  ]
}

Rules:
- severity "critical" = prohibited practice, active enforcement risk, or immediate legal liability
- severity "high" = significant gap requiring priority action
- severity "medium" = gap requiring attention, lower immediate risk
- cite specific articles: "GDPR Article 9(2)(a)" not just "GDPR"
- remediation must be actionable by an engineer or legal counsel
- order gaps by severity descending
- never invent regulations not in the retrieved clauses or deployment profile
- return lowercase risk values: "high", "med", or "low"
`;

// ── Risk scoring ──────────────────────────────────────────────────────────────

const DOMAIN_SCORES:      Record<string, number> = { cv:22, ai:20, cyber:18, adm:18, privacy:16, robotics:14 };
const JURISDICTION_SCORES:Record<string, number> = { eu:22, us_state:16, uk:14, us_federal:12, apac:10, latam:8, mena:8 };
const DEPLOYMENT_SCORES:  Record<string, number> = { facial_recognition:25, law_enforcement:25, workplace_surveillance:22, healthcare_ai:20, hiring_ai:18, credit_scoring:18, autonomous_systems:18, consumer_profiling:14, content_moderation:12, iot_connected:12 };
const DATA_TYPE_SCORES:   Record<string, number> = { biometric:25, health:24, neural:22, children:20, location:16, financial:15, communications:12, behavioural:10, general_pi:5 };
const SECTOR_SCORES:      Record<string, number> = { government:20, healthcare:18, finance:16, hr_recruitment:14, education:14, transport:12, media_adtech:12, legal:12, retail:8, proptech:8 };

function scoreList(items: string[], table: Record<string, number>) {
  return Math.min(items.reduce((s, v) => s + (table[v.toLowerCase()] || 0), 0), 100);
}

function calcRisk(inputs: { domains:string[]; jurisdictions:string[]; deployments:string[]; data_types:string[]; sector:string }) {
  const sub = {
    data_types:    scoreList(inputs.data_types,    DATA_TYPE_SCORES),
    deployment:    scoreList(inputs.deployments,   DEPLOYMENT_SCORES),
    domains:       scoreList(inputs.domains,       DOMAIN_SCORES),
    jurisdictions: scoreList(inputs.jurisdictions, JURISDICTION_SCORES),
    sector:        scoreList([inputs.sector],      SECTOR_SCORES),
  };
  const composite = Math.round(
    sub.data_types*0.24 + sub.deployment*0.22 + sub.domains*0.20 + sub.jurisdictions*0.20 + sub.sector*0.14
  );
  return { composite, tier: composite>=70?"High":composite>=40?"Medium":"Low", sub_scores: sub };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJSON(raw: string) {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const start = s.indexOf("{");
  if (start > 0) s = s.slice(start);
  try { return JSON.parse(s); }
  catch {
    // close unclosed brackets
    const stack: string[] = [];
    let inStr = false, esc = false;
    for (const c of s) {
      if (inStr) { esc = c === "\\" && !esc; if (!esc && c === '"') inStr=false; continue; }
      if (c==='"') inStr=true;
      else if (c==="{") stack.push("}");
      else if (c==="[") stack.push("]");
      else if ((c==="}"||c==="]") && stack.length && stack[stack.length-1]===c) stack.pop();
    }
    return JSON.parse(s + stack.reverse().join(""));
  }
}

function normSev(v: string) {
  const s = v.toLowerCase();
  if (s.includes("critical") || s.includes("urgent")) return "critical";
  if (s.includes("high") || s.includes("severe"))     return "high";
  return "medium";
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = await req.json();
    const {
      description,
      domains       = [],
      jurisdictions = [],
      deployments   = [],
      data_types    = [],
      sector        = "",
    } = body;

    if (!description || description.trim().length < 10) {
      return NextResponse.json({ error: "Description too short" }, { status: 400 });
    }

    // 1. Risk score
    const riskResult = calcRisk({ domains, jurisdictions, deployments, data_types, sector });

    // 2. Embed
    const query = `${description}. Domains: ${domains.join(", ")}. Data: ${data_types.join(", ")}. Jurisdictions: ${jurisdictions.join(", ")}.`;
    const embedRes  = await voyage.embed({ input: [query], model: "voyage-3-large", inputType: "query" });
    const embedding = (embedRes as { data?: { embedding?: number[] }[]; embeddings?: number[][] }).data?.[0]?.embedding
      ?? (embedRes as { embeddings?: number[][] }).embeddings?.[0];

    // 3. Retrieve chunks
    const { data: chunks } = await supabase.rpc("match_regulatory_chunks", {
      query_embedding: embedding,
      match_threshold: 0.35,
      match_count:     12,
    });

    const clauseText = (chunks || []).map((c: {
      reg_abbr: string;
      reg_name: string;
      jurisdiction: string;
      state?: string;
      chunk_text: string;
    }, i: number) =>
      `[${i+1}] ${c.reg_abbr}, ${c.reg_name}\n    ${c.jurisdiction}${c.state ? ` (${c.state})` : ""}\n    ${c.chunk_text}`
    ).join("\n\n");

    // 4. Claude
    const userMsg = `
DEPLOYMENT DESCRIPTION:
${description}

PROFILE:
- Domains: ${domains.join(", ") || "not specified"}
- Jurisdictions: ${jurisdictions.join(", ") || "not specified"}
- Deployment types: ${deployments.join(", ") || "not specified"}
- Data types: ${data_types.join(", ") || "not specified"}
- Sector: ${sector || "not specified"}
- Risk exposure score: ${riskResult.composite}/100 (${riskResult.tier})

RETRIEVED REGULATORY CLAUSES:
${clauseText || "No specific clauses retrieved. Assess based on deployment description and general knowledge."}

Return your compliance assessment as JSON.
`;

    const response = await claude.messages.create({
      model:    "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system:   SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });

    const raw        = response.content[0].type === "text" ? response.content[0].text : "";
    const assessment = parseJSON(raw);

    // 5. Normalise
    if (Array.isArray(assessment.gaps)) {
      assessment.gaps = assessment.gaps.map((g: {
        severity?: string;
        remediation?: string;
        fix?: string;
        detail?: string;
        description?: string;
        frameworks?: string[];
      }) => ({
        ...g,
        severity:    normSev(g.severity ?? "medium"),
        remediation: g.remediation ?? g.fix ?? "",
        detail:      g.detail ?? g.description ?? "",
        frameworks:  Array.isArray(g.frameworks) ? g.frameworks : [],
      }));
    }
    if (!assessment.risk) {
      assessment.risk = riskResult.tier.toLowerCase() === "high" ? "high"
        : riskResult.tier.toLowerCase() === "medium" ? "med" : "low";
    }

    assessment.risk_score = {
      composite:  riskResult.composite,
      tier:       riskResult.tier,
      sub_scores: riskResult.sub_scores,
    };

    assessment.meta = {
      assessed_at:      new Date().toISOString(),
      chunks_retrieved: (chunks || []).length,
    };

    // 6. Save
    const title = assessment.title || description.slice(0, 80);
    const { data: saved, error: saveErr } = await supabase
      .from("assessments")
      .insert({
        user_id:      userId,
        title,
        description:  description.slice(0, 500),
        result:       assessment,
        risk_tier:    riskResult.tier,
        risk_score:   riskResult.composite,
        domains,
        jurisdictions,
      })
      .select("id")
      .single();

    if (saveErr) console.error("Supabase save error:", saveErr.message);

    return NextResponse.json({ ...assessment, id: saved?.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Assessment failed";
    console.error("Assessment error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
