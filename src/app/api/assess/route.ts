import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { filterRegulatoryChunks, buildRegulatoryContextBlock, type RegulatoryChunk } from "@/lib/rag";
import { buildDocumentContextBlock } from "@/lib/documents";
import { buildCassiusSystemPrompt, mapDomainToFocus } from "@/lib/agent-prompts";

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

function normalizeGapDomain(raw: string): string {
  const d = raw.toLowerCase();
  if (d === "ai" || d === "ai_governance") return "ai_governance";
  if (d === "cyber" || d === "cybersecurity") return "cybersecurity";
  return "privacy";
}

// Gap-driven risk scoring — derived entirely from Claude's gap analysis output.
// No lookup tables. No pre-calculated weights.
function deriveRiskFromGaps(gaps: Array<{ severity: string; domain: string }>) {
  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const domains = ["privacy", "ai_governance", "cybersecurity"];

  // Overall tier
  const maxSeverity = gaps.reduce((max, g) => {
    const rank = severityRank[g.severity?.toLowerCase()] ?? 0;
    return rank > max ? rank : max;
  }, 0);

  const overallTier =
    maxSeverity >= 4 ? "critical" :
    maxSeverity >= 3 ? "high" :
    maxSeverity >= 2 ? "medium" : "low";

  // Per-domain tier
  const byDomain: Record<string, { tier: string; gap_count: number }> = {};
  for (const domain of domains) {
    const domainGaps = gaps.filter(g => g.domain === domain);
    const domainMax  = domainGaps.reduce((max, g) => {
      const rank = severityRank[g.severity?.toLowerCase()] ?? 0;
      return rank > max ? rank : max;
    }, 0);
    byDomain[domain] = {
      tier: domainMax >= 4 ? "critical" : domainMax >= 3 ? "high" : domainMax >= 2 ? "medium" : "low",
      gap_count: domainGaps.length,
    };
  }

  return { overall: overallTier, byDomain };
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
        document_ids  = [] as string[],
        folder_id     = null as string | null,
        prior_assessment_number = null as string | null,
      } = body;

      if (description.trim().length < 10) {
        await send({ type: "error", text: "Description too short" });
        await writer.close();
        return;
      }

      await send({ type: "status", text: "Searching 93 regulations..." });
      const embedding = await getEmbedding(description);

      const { data: chunks } = await supabase.rpc("match_regulatory_chunks", {
        query_embedding: embedding,
        match_threshold: 0.40,
        match_count:     12,
      });

      const filtered   = filterRegulatoryChunks((chunks ?? []) as RegulatoryChunk[], 0.40);
      const clauseText = buildRegulatoryContextBlock(filtered);

      await send({ type: "status", text: "Analysing your deployment..." });

      // Fetch any referenced documents and inject into assessment context
      let docContext = "";
      if (document_ids.length > 0 && userId) {
        docContext = await buildDocumentContextBlock(document_ids, userId);
      }

      const userMsg = [
        `DEPLOYMENT: ${description}`,
        `CONTEXT: domains=${domains.join(",") || "inferred"} | jurisdictions=${jurisdictions.join(",") || "inferred"} | data=${data_types.join(",") || "inferred"} | sector=${sector || "inferred"}`,
        ``,
        `REGULATORY CLAUSES:`,
        clauseText || "No clauses retrieved.",
        contract_text ? `\nCONTRACT:\n${contract_text.slice(0, 6000)}` : "",
        docContext ? `\nREFERENCED DOCUMENTS:\n${docContext.slice(0, 4000)}` : "",
      ].join("\n");

      const hasDocument = document_ids.length > 0 || !!contract_text.trim();
      const primaryDomain = domains.length === 1 ? mapDomainToFocus(domains[0]) : null;
      const systemPrompt = buildCassiusSystemPrompt({
        hasDocument,
        priorAssessmentNumber: prior_assessment_number,
        primaryDomain,
      });

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 4000,
        system:     systemPrompt,
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

      // Normalise gaps
      const gaps = Array.isArray(assessment.gaps)
        ? (assessment.gaps as Record<string, unknown>[]).map(g => ({
            ...g,
            severity:    String(g.severity || "medium").toLowerCase(),
            domain:      normalizeGapDomain(String(g.domain || "privacy")),
            detail:      g.detail      || g.description || "",
            remediation: g.remediation || g.fix         || "",
            frameworks:  Array.isArray(g.frameworks) ? g.frameworks : [],
          }))
        : [];

      assessment.gaps = gaps;

      // Derive risk entirely from gap analysis — no lookup tables
      const risk = deriveRiskFromGaps(gaps as Array<{ severity: string; domain: string }>);
      assessment.risk_tier      = risk.overall;
      assessment.risk_by_domain = risk.byDomain;

      // Remove any legacy numeric score from Claude's output
      delete assessment.risk_score;

      assessment.summary = fullText.split("---JSON---")[0].trim() || (assessment.summary as string) || "";

      const messageTags = tags.length > 0
        ? tags
        : [...domains, ...jurisdictions, ...data_types, sector].filter(Boolean);

      const { data: saved } = await supabase.from("assessments").insert({
        user_id:      userId,
        title:        (assessment.title as string) || description.slice(0, 80),
        description:  description.slice(0, 500),
        result:       assessment,
        messages:     [
          { role: "user",      content: description, tags: messageTags },
          { role: "assistant", assessment },
        ],
        risk_tier:    risk.overall,
        domains,
        jurisdictions,
        folder_id:    folder_id || null,
        // Auto-assign to the user who ran the assessment
        assigned_to:  [userId],
      }).select("id, assessment_number").single();

      assessment.id                = saved?.id;
      assessment.assessment_number = saved?.assessment_number;

      if (folder_id && saved?.id) {
        await supabase.from("folder_items").upsert({
          folder_id,
          item_type: "assessment",
          item_id:   saved.id,
        });
      }

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
