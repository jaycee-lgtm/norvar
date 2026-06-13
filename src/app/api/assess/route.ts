import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { buildDocumentContextBlock } from "@/lib/documents";
import { retrieveRegulatoryContext } from "@/lib/regulatory-rag";
import { buildCassiusSystemPrompt, mapDomainToFocus } from "@/lib/agent-prompts";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);


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

export const maxDuration = 300;

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
        guided_scoping = false,
      } = body;

      if (description.trim().length < 10) {
        await send({ type: "error", text: "Description too short" });
        await writer.close();
        return;
      }

      await send({ type: "status", text: "Searching regulatory corpus..." });
      const { contextBlock: clauseText } = await retrieveRegulatoryContext(supabase, description, {
        matchThreshold: 0.40,
        matchCount:     12,
        minSimilarity:  0.40,
      });

      await send({ type: "status", text: "Analysing your deployment..." });

      // Fetch any referenced documents and inject into assessment context
      let docContext = "";
      if (document_ids.length > 0 && userId) {
        docContext = await buildDocumentContextBlock(document_ids, userId);
      }

      const contextLabel = guided_scoping ? "USER-CONFIRMED SCOPING" : "CONTEXT";
      const userMsg = [
        description,
        ``,
        `${contextLabel}: domains=${domains.join(",") || "none"} | jurisdictions=${jurisdictions.join(",") || "none"} | data=${data_types.join(",") || "none"} | sector=${sector || "none"}`,
        guided_scoping
          ? `NOTE: The deployment description above includes an AUTHORITATIVE USER SCOPING block. Every gap must follow from those confirmed answers — do not assume facts outside that block.`
          : "",
        ``,
        `REGULATORY CLAUSES:`,
        clauseText || "No clauses retrieved.",
        contract_text ? `\nCONTRACT:\n${contract_text.slice(0, 6000)}` : "",
        docContext ? `\nREFERENCED DOCUMENTS:\n${docContext.slice(0, 4000)}` : "",
      ].filter(Boolean).join("\n");

      const hasDocument = document_ids.length > 0 || !!contract_text.trim();
      const primaryDomain = domains.length === 1 ? mapDomainToFocus(domains[0]) : null;
      const systemPrompt = buildCassiusSystemPrompt({
        hasDocument,
        priorAssessmentNumber: prior_assessment_number,
        primaryDomain,
        guidedScoping: guided_scoping,
      });

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 4000,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userMsg }],
        stream:     true,
      });

      let fullText    = "";
      let pastSep     = false;
      let proseSentLen = 0;
      let lastPing     = Date.now();

      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (Date.now() - lastPing > 12_000) {
          await send({ type: "ping" });
          lastPing = Date.now();
        }
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const chunk = event.delta.text ?? "";
          fullText += chunk;
          if (pastSep) continue;

          const sepIdx = fullText.indexOf("---JSON---");
          if (sepIdx >= 0) {
            pastSep = true;
            const prose = fullText.slice(0, sepIdx);
            const remainder = prose.slice(proseSentLen);
            if (remainder) await send({ type: "token", text: remainder });
            proseSentLen += remainder.length;
          } else {
            await send({ type: "token", text: chunk });
            proseSentLen += chunk.length;
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

      // Deliver results to the client before persistence so a slow/failed save
      // cannot strand the UI after Claude has already finished.
      await send({ type: "done", assessment: { ...assessment } });

      await send({ type: "status", text: "Saving assessment..." });

      const messageTags = tags.length > 0
        ? tags
        : [...domains, ...jurisdictions, ...data_types, sector].filter(Boolean);

      const { data: saved, error: saveError } = await supabase.from("assessments").insert({
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
        assigned_to:  [userId],
      }).select("id, assessment_number").single();

      if (saveError) {
        console.error("Assess save error:", saveError);
        await send({ type: "warning", text: "Assessment completed but could not be saved to history." });
      } else {
        assessment.id                = saved?.id;
        assessment.assessment_number = saved?.assessment_number;

        if (folder_id && saved?.id) {
          await supabase.from("folder_items").upsert({
            folder_id,
            item_type: "assessment",
            item_id:   saved.id,
          });
        }

        await send({ type: "saved", assessment: { ...assessment } });
      }
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
