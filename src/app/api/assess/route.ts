import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model: "voyage-3-large", input_type: "query" }),
  });
  const json = await res.json();
  return json.data?.[0]?.embedding ?? [];
}

const SYSTEM_PROMPT = `
You are a senior Governance, Risk and Compliance analyst specialising in technology regulation
across AI, privacy, cybersecurity, computer vision, automated decisioning, and robotics globally.

Respond in EXACTLY this format — a plain text summary, then a separator, then JSON:

Write 2-3 sentences of plain English summary of the compliance position and the most urgent priority.
No markdown, no bullets, just clear prose.

---JSON---

{
  "title": "short title (max 8 words)",
  "risk": "high" | "med" | "low",
  "risk_score": <integer 0-100>,
  "frameworks": ["framework abbreviation strings"],
  "gaps": [
    {
      "severity": "critical" | "high" | "medium",
      "title": "short gap title",
      "detail": "specific issue with article citations",
      "frameworks": ["applicable frameworks"],
      "remediation": "specific actionable fix"
    }
  ]
}

Rules: output prose FIRST, then ---JSON--- separator, then JSON. Order gaps by severity descending.
Never invent regulations not in the retrieved clauses. risk_score 70-100=high, 40-69=medium, 0-39=low.
`;

const D: Record<string, number> = { cv: 22, ai: 20, cyber: 18, adm: 18, privacy: 16, robotics: 14 };
const J: Record<string, number> = { eu: 22, us_state: 16, uk: 14, us_federal: 12, canada: 10, apac: 10, latam: 8, mena: 8 };
const T: Record<string, number> = { biometric: 25, health: 24, children: 20, location: 16, financial: 15, behavioural: 10, communications: 12, general_pi: 5 };
const S: Record<string, number> = { government: 20, healthcare: 18, finance: 16, hr_recruitment: 14, education: 14, transport: 12, media_adtech: 12, legal: 12, retail: 8, proptech: 8 };

function calcRisk(d: string[], j: string[], t: string[], s: string) {
  const sc = (i: string[], tb: Record<string, number>) =>
    Math.min(i.reduce((a, v) => a + (tb[v.toLowerCase()] || 0), 0), 100);
  const sub = { domains: sc(d, D), jurisdictions: sc(j, J), data_types: sc(t, T), sector: sc([s], S) };
  const composite = Math.round(sub.domains * 0.25 + sub.jurisdictions * 0.25 + sub.data_types * 0.3 + sub.sector * 0.2);
  return { composite, tier: composite >= 70 ? "High" : composite >= 40 ? "Medium" : "Low", sub };
}

function parseJSON(raw: string) {
  let s = raw.trim().replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON");
  s = s.slice(start);
  try {
    return JSON.parse(s);
  } catch {
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    for (const c of s) {
      if (inStr) {
        esc = c === "\\" && !esc;
        if (!esc && c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) stack.pop();
    }
    return JSON.parse(s + stack.reverse().join(""));
  }
}

function sse(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const send   = (d: object) => writer.write(enc.encode(sse(d)));

  (async () => {
    try {
      const { userId } = await auth();
      if (!userId) {
        await send({ type: "error", text: "Unauthorised" });
        await writer.close();
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
        await send({ type: "error", text: "Description too short" });
        await writer.close();
        return;
      }

      const risk = calcRisk(domains, jurisdictions, data_types, sector);

      await send({ type: "status", text: "Searching 140+ regulations..." });
      const embedding = await getEmbedding(description);

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
        `[${i + 1}] ${c.reg_abbr} — ${c.jurisdiction}${c.state ? ` (${c.state})` : ""}\n${c.chunk_text}`,
      ).join("\n\n");

      await send({ type: "status", text: "Analysing your deployment..." });

      const userMsg = `DEPLOYMENT: ${description}\nPROFILE: domains=${domains.join(",") || "n/a"} | jurisdictions=${jurisdictions.join(",") || "n/a"} | data=${data_types.join(",") || "n/a"} | sector=${sector || "n/a"}\nRisk: ${risk.composite}/100 (${risk.tier})\n\nREGULATORY CLAUSES:\n${clauseText || "No clauses retrieved."}${contract_text ? `\n\nCONTRACT:\n${contract_text.slice(0, 6000)}` : ""}`;

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 4000,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: userMsg }],
        stream:     true,
      });

      let fullText = "";
      let pastSep  = false;

      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const chunk = event.delta.text ?? "";
          fullText += chunk;
          if (!pastSep) {
            if (fullText.includes("---JSON---")) {
              pastSep = true;
              const summaryPart = fullText.split("---JSON---")[0].trim();
              if (summaryPart) await send({ type: "summary", text: summaryPart });
            } else {
              await send({ type: "token", text: chunk });
            }
          }
        }
      }

      const jsonPart = fullText.includes("---JSON---") ? fullText.split("---JSON---")[1] : fullText;
      let assessment: Record<string, unknown> = {};
      try {
        assessment = parseJSON(jsonPart);
      } catch {
        await send({ type: "error", text: "Failed to parse assessment. Please try again." });
        await writer.close();
        return;
      }

      if (Array.isArray(assessment.gaps)) {
        assessment.gaps = (assessment.gaps as Record<string, unknown>[]).map(g => ({
          ...g,
          severity:    String(g.severity || "medium").toLowerCase(),
          detail:      g.detail || g.description || "",
          remediation: g.remediation || g.fix || "",
          frameworks:  Array.isArray(g.frameworks) ? g.frameworks : [],
        }));
      }

      assessment.risk_score = { composite: risk.composite, tier: risk.tier, sub: risk.sub };
      assessment.summary = fullText.split("---JSON---")[0].trim() || (assessment.summary as string) || "";

      const messageTags = tags.length > 0
        ? tags
        : [...domains, ...jurisdictions, ...data_types, sector].filter(Boolean);

      const initialMessages = [
        { role: "user", content: description, tags: messageTags },
        { role: "assistant", assessment },
      ];

      const { data: saved } = await supabase.from("assessments").insert({
        user_id:      userId,
        title:        (assessment.title as string) || description.slice(0, 80),
        description:  description.slice(0, 500),
        result:       assessment,
        messages:     initialMessages,
        risk_tier:    risk.tier,
        risk_score:   risk.composite,
        domains,
        jurisdictions,
      }).select("id").single();

      assessment.id = saved?.id;
      await send({ type: "done", assessment });
    } catch (err: unknown) {
      console.error("Assess error:", err);
      await send({ type: "error", text: err instanceof Error ? err.message : "Assessment failed" });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      Connection:          "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
