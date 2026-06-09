import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { VoyageAIClient } from "voyageai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a senior Governance, Risk and Compliance analyst specialising in technology regulation
across AI, privacy, cybersecurity, computer vision, automated decisioning, and robotics, globally.

Respond in EXACTLY this format, two sections separated by ---JSON---:

Section 1: 2-3 sentences of plain English summary of the compliance position and the most
urgent priority. No markdown, no bullets, just clear prose.

---JSON---

Section 2: A valid JSON object:
{
  "title": "short title describing the deployment (max 8 words)",
  "risk": "high" | "med" | "low",
  "risk_score": <integer 0-100>,
  "frameworks": ["applicable framework abbreviation strings"],
  "gaps": [
    {
      "severity": "critical" | "high" | "medium",
      "title": "short gap title",
      "detail": "what the requirement is and how the deployment falls short, cite specific articles",
      "frameworks": ["framework abbreviations for this gap"],
      "remediation": "specific actionable fix"
    }
  ]
}

Rules:
- Output plain prose summary FIRST, then ---JSON--- separator, then JSON
- critical = prohibited practice, active enforcement risk, or immediate liability
- high = significant gap requiring priority action
- medium = gap requiring attention, lower immediate risk
- cite specific articles: "GDPR Art.9(2)(a)" not just "GDPR"
- order gaps by severity descending
- never invent regulations not in the retrieved clauses
`;

// ── Risk scoring ───────────────────────────────────────────────────────────────

const DOMAIN_SCORES:       Record<string, number> = { cv:22, ai:20, cyber:18, adm:18, privacy:16, robotics:14 };
const JURISDICTION_SCORES: Record<string, number> = { eu:22, us_state:16, uk:14, us_federal:12, canada:10, apac:10, latam:8, mena:8 };
const DATA_TYPE_SCORES:    Record<string, number> = { biometric:25, health:24, children:20, location:16, financial:15, behavioural:10, communications:12, general_pi:5 };
const SECTOR_SCORES:       Record<string, number> = { government:20, healthcare:18, finance:16, hr_recruitment:14, education:14, transport:12, media_adtech:12, legal:12, retail:8, proptech:8 };

function calcRisk(domains: string[], jurisdictions: string[], dataTypes: string[], sector: string) {
  const score = (items: string[], table: Record<string, number>) =>
    Math.min(items.reduce((a, v) => a + (table[v.toLowerCase()] || 0), 0), 100);
  const sub = {
    domains:       score(domains,       DOMAIN_SCORES),
    jurisdictions: score(jurisdictions, JURISDICTION_SCORES),
    data_types:    score(dataTypes,     DATA_TYPE_SCORES),
    sector:        score([sector],      SECTOR_SCORES),
  };
  const composite = Math.round(
    sub.domains * 0.25 + sub.jurisdictions * 0.25 + sub.data_types * 0.3 + sub.sector * 0.2
  );
  return { composite, tier: composite >= 70 ? "High" : composite >= 40 ? "Medium" : "Low", sub };
}

// ── JSON helpers ───────────────────────────────────────────────────────────────

function sseChunk(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function parseAssessmentJSON(raw: string) {
  let s = raw.trim();
  s = s.replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON found");
  s = s.slice(start);
  try { return JSON.parse(s); }
  catch {
    const stack: string[] = [];
    let inStr = false, esc = false;
    for (const c of s) {
      if (inStr) { esc = c === "\\" && !esc; if (!esc && c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) stack.pop();
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

// ── POST — streaming assess ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(sseChunk(data)));

      try {
        const { userId } = await auth();
        if (!userId) {
          send({ type: "error", text: "Unauthorised" });
          controller.close();
          return;
        }

        const body = await req.json();
        const {
          description   = "",
          domains       = [] as string[],
          jurisdictions = [] as string[],
          data_types    = [] as string[],
          sector        = "",
          contract_text = "",
          tags          = [] as string[],
        } = body;

        if (description.trim().length < 10) {
          send({ type: "error", text: "Description too short" });
          controller.close();
          return;
        }

        const risk = calcRisk(domains, jurisdictions, data_types, sector);

        send({ type: "status", text: "Searching 140+ regulations..." });

        const embedRes = await voyage.embed({
          input:     [description],
          model:     "voyage-3-large",
          inputType: "query",
        });
        const embedding = (embedRes as { data?: { embedding?: number[] }[]; embeddings?: number[][] }).data?.[0]?.embedding
          ?? (embedRes as { embeddings?: number[][] }).embeddings?.[0];

        const { data: chunks } = await supabase.rpc("match_regulatory_chunks", {
          query_embedding: embedding,
          match_threshold: 0.35,
          match_count:     12,
        });

        const clauseText = (chunks || []).map((c: {
          reg_abbr: string;
          jurisdiction: string;
          state?: string;
          chunk_text: string;
        }, i: number) =>
          `[${i + 1}] ${c.reg_abbr}, ${c.jurisdiction}${c.state ? ` (${c.state})` : ""}\n${c.chunk_text}`
        ).join("\n\n");

        send({ type: "status", text: "Analysing your deployment..." });

        const userMsg = `
DEPLOYMENT: ${description}
PROFILE: domains=${domains.join(",") || "n/a"} | jurisdictions=${jurisdictions.join(",") || "n/a"} | data=${data_types.join(",") || "n/a"} | sector=${sector || "n/a"}
External risk score: ${risk.composite}/100 (${risk.tier})

RETRIEVED CLAUSES:
${clauseText || "No specific clauses retrieved."}
${contract_text ? `\nCONTRACT TEXT:\n${contract_text.slice(0, 6000)}` : ""}`;

        const claudeStream = claude.messages.stream({
          model:      "claude-sonnet-4-6",
          max_tokens: 4000,
          system:     SYSTEM_PROMPT,
          messages:   [{ role: "user", content: userMsg }],
        });

        let fullText = "";
        let pastSep  = false;

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            fullText += chunk;

            if (!pastSep && fullText.includes("---JSON---")) {
              pastSep = true;
              const summaryPart = fullText.split("---JSON---")[0].trim();
              if (summaryPart) send({ type: "summary", text: summaryPart });
              continue;
            }

            if (!pastSep) {
              send({ type: "token", text: chunk });
            }
          }
        }

        const jsonPart = fullText.includes("---JSON---")
          ? fullText.split("---JSON---")[1]
          : fullText;

        let assessment: Record<string, unknown>;
        try {
          assessment = parseAssessmentJSON(jsonPart);
        } catch {
          send({ type: "error", text: "Failed to parse assessment. Please try again." });
          controller.close();
          return;
        }

        if (Array.isArray(assessment.gaps)) {
          assessment.gaps = assessment.gaps.map((g: {
            severity?: string;
            detail?: string;
            description?: string;
            remediation?: string;
            fix?: string;
            frameworks?: string[];
          }) => ({
            ...g,
            severity:    normSev(g.severity ?? "medium"),
            detail:      g.detail ?? g.description ?? "",
            remediation: g.remediation ?? g.fix ?? "",
            frameworks:  Array.isArray(g.frameworks) ? g.frameworks : [],
          }));
        }

        if (!assessment.risk) {
          assessment.risk = risk.tier.toLowerCase() === "high" ? "high"
            : risk.tier.toLowerCase() === "medium" ? "med" : "low";
        }

        assessment.risk_score = { composite: risk.composite, tier: risk.tier, sub: risk.sub };
        assessment.summary = fullText.split("---JSON---")[0].trim()
          || (assessment.summary as string)
          || "";
        assessment.meta = {
          assessed_at:      new Date().toISOString(),
          chunks_retrieved: (chunks || []).length,
        };

        const initialMessages = [
          { role: "user", content: description, tags },
          { role: "assistant", assessment },
        ];

        const { data: saved, error: saveErr } = await supabase
          .from("assessments")
          .insert({
            user_id:      userId,
            title:        (assessment.title as string) || description.slice(0, 80),
            description:  description.slice(0, 500),
            result:       assessment,
            messages:     initialMessages,
            risk_tier:    risk.tier,
            risk_score:   risk.composite,
            domains,
            jurisdictions,
          })
          .select("id")
          .single();

        if (saveErr) console.error("Supabase save error:", saveErr.message);

        assessment.id = saved?.id;
        send({ type: "done", assessment });
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Assessment failed";
        console.error("Assess error:", err);
        controller.enqueue(encoder.encode(sseChunk({ type: "error", text: message })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":        "text/event-stream",
      "Cache-Control":       "no-cache, no-transform",
      Connection:            "keep-alive",
      "X-Accel-Buffering":   "no",
    },
  });
}
