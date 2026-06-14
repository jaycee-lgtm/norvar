import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { buildDocumentContextBlock } from "@/lib/documents";
import { retrieveRegulatoryContext } from "@/lib/regulatory-rag";
import { buildCassiusSystemPrompt, mapDomainToFocus } from "@/lib/agent-prompts";
import { getUserFrameworkScope } from "@/lib/user-framework-scope";
import {
  AssessmentGapStreamParser,
  buildProcessingResult,
  deriveRiskFromGaps,
  normalizeStreamGap,
  type StreamGap,
} from "@/lib/streaming-assessment";

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

type PersistInput = {
  assessmentId: string;
  userId:         string;
  description:    string;
  messageTags:    string[];
  domains:        string[];
  jurisdictions:  string[];
  folderId:       string | null;
  result:         Record<string, unknown>;
  riskTier:       string;
  title?:         string;
};

async function persistAssessment(row: PersistInput) {
  const assistantAssessment = {
    ...row.result,
    id: row.assessmentId,
  };

  await supabase.from("assessments").update({
    title:     row.title ?? (row.result.title as string) ?? row.description.slice(0, 80),
    result:    row.result,
    risk_tier: row.riskTier,
    messages:  [
      { role: "user", content: row.description, tags: row.messageTags },
      { role: "assistant", assessment: assistantAssessment },
    ],
  })
    .eq("id", row.assessmentId)
    .eq("user_id", row.userId);
}

export async function POST(req: NextRequest) {
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const send   = (d: object) => writer.write(enc.encode(sse(d)));

  (async () => {
    let assessmentId: string | null = null;
    let streamedGaps: StreamGap[]   = [];
    let summaryText                   = "";

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

      const messageTags = tags.length > 0
        ? tags
        : [...domains, ...jurisdictions, ...data_types, sector].filter(Boolean);

      const initialResult = buildProcessingResult([], {
        title:   description.slice(0, 80) || "Compliance assessment",
        status:  "processing",
        summary: "",
      });

      const { data: created, error: createError } = await supabase.from("assessments").insert({
        user_id:       userId,
        title:         description.slice(0, 80) || "Compliance assessment",
        description:   description.slice(0, 500),
        result:        initialResult,
        messages:      [
          { role: "user", content: description, tags: messageTags },
          { role: "assistant", assessment: { ...initialResult, status: "processing" } },
        ],
        risk_tier:     "low",
        domains,
        jurisdictions,
        folder_id:     folder_id || null,
        assigned_to:   [userId],
      }).select("id, assessment_number").single();

      if (createError || !created?.id) {
        console.error("Assess create error:", createError);
        await send({ type: "error", text: "Could not start assessment. Please try again." });
        await writer.close();
        return;
      }

      assessmentId = created.id;

      if (folder_id) {
        await supabase.from("folder_items").upsert({
          folder_id,
          item_type: "assessment",
          item_id:   created.id,
        });
      }

      await send({
        type:                "started",
        assessment_id:       created.id,
        assessment_number:   created.assessment_number,
        assessment:          { ...initialResult, id: created.id, assessment_number: created.assessment_number },
      });

      await send({ type: "status", text: "Searching regulatory corpus..." });
      const { selectedFrameworkAbbrs, scopePrompt } = await getUserFrameworkScope(userId);
      const { contextBlock: clauseText } = await retrieveRegulatoryContext(supabase, description, {
        matchThreshold: 0.40,
        matchCount:     12,
        minSimilarity:  0.40,
        selectedFrameworkAbbrs,
      });

      await send({ type: "status", text: "Analysing your deployment..." });

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
        scopePrompt ? `\n${scopePrompt}` : "",
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

      let fullText     = "";
      let pastSep      = false;
      let proseSentLen = 0;
      let jsonEmittedLen = 0;
      let lastPing     = Date.now();
      const gapParser  = new AssessmentGapStreamParser();

      const flushGaps = async (newGaps: StreamGap[]) => {
        if (!newGaps.length || !assessmentId) return;

        streamedGaps = [...streamedGaps, ...newGaps];
        const result = buildProcessingResult(streamedGaps, {
          title:   description.slice(0, 80) || "Compliance assessment",
          summary: summaryText,
          status:  "processing",
        });

        await persistAssessment({
          assessmentId,
          userId,
          description,
          messageTags,
          domains,
          jurisdictions,
          folderId: folder_id,
          result,
          riskTier: result.risk_tier as string,
        });

        for (let i = 0; i < newGaps.length; i++) {
          const index = streamedGaps.length - newGaps.length + i;
          await send({
            type: "gap",
            gap:  newGaps[i],
            index,
            assessment: { ...result, id: assessmentId, assessment_number: created.assessment_number },
          });
        }
      };

      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (Date.now() - lastPing > 12_000) {
          await send({ type: "ping" });
          lastPing = Date.now();
        }
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const chunk = event.delta.text ?? "";
          fullText += chunk;

          const sepIdx = fullText.indexOf("---JSON---");
          if (sepIdx >= 0) {
            if (!pastSep) {
              pastSep = true;
              const prose = fullText.slice(0, sepIdx);
              const remainder = prose.slice(proseSentLen);
              if (remainder) await send({ type: "token", text: remainder });
              proseSentLen += remainder.length;
              summaryText = prose.trim();
              await send({ type: "status", text: "Surfacing gaps..." });
            }

            const jsonFull = fullText.slice(sepIdx + "---JSON---".length);
            const jsonDelta = jsonFull.slice(jsonEmittedLen);
            jsonEmittedLen = jsonFull.length;
            if (jsonDelta) {
              gapParser.append(jsonDelta);
              await flushGaps(gapParser.drainNewGaps());
            }
          } else {
            await send({ type: "token", text: chunk });
            proseSentLen += chunk.length;
          }
        }
      }

      summaryText = fullText.split("---JSON---")[0].trim() || summaryText;
      const jsonPart = fullText.includes("---JSON---") ? fullText.split("---JSON---")[1] : fullText;

      let assessment: Record<string, unknown> = {};
      let parseFailed = false;
      try {
        assessment = parseJSON(jsonPart);
      } catch {
        parseFailed = true;
        if (streamedGaps.length === 0) {
          await send({ type: "error", text: "Failed to parse assessment. Please try again." });
          if (assessmentId) {
            await persistAssessment({
              assessmentId,
              userId,
              description,
              messageTags,
              domains,
              jurisdictions,
              folderId: folder_id,
              result: buildProcessingResult([], { status: "failed", summary: summaryText }),
              riskTier: "low",
            });
          }
          await writer.close();
          return;
        }
        assessment = buildProcessingResult(streamedGaps, {
          title:   description.slice(0, 80),
          summary: summaryText,
          status:  "partial",
        });
      }

      if (!parseFailed) {
        const gaps = Array.isArray(assessment.gaps)
          ? (assessment.gaps as Record<string, unknown>[]).map(g => ({
              ...normalizeStreamGap(g),
              domain: normalizeGapDomain(String(g.domain || "privacy")),
            }))
          : streamedGaps;

        assessment.gaps = gaps;
        const risk = deriveRiskFromGaps(gaps as Array<{ severity: string; domain: string }>);
        assessment.risk_tier      = risk.overall;
        assessment.risk_by_domain = risk.byDomain;
        delete assessment.risk_score;
        assessment.summary = summaryText || (assessment.summary as string) || "";
        assessment.status  = "complete";
        streamedGaps       = gaps as StreamGap[];
      }

      assessment.id                = assessmentId;
      assessment.assessment_number = created.assessment_number;

      await send({ type: "done", assessment });

      await persistAssessment({
        assessmentId: assessmentId!,
        userId,
        description,
        messageTags,
        domains,
        jurisdictions,
        folderId: folder_id,
        result:     assessment,
        riskTier:   String(assessment.risk_tier || "low"),
        title:      assessment.title as string | undefined,
      });

      await send({ type: "saved", assessment });
    } catch (err: unknown) {
      console.error("Assess error:", err);
      if (assessmentId) {
        const partialResult = buildProcessingResult(streamedGaps, {
          summary: summaryText,
          status:  streamedGaps.length ? "partial" : "failed",
        });
        const partial = { ...partialResult, id: assessmentId };
        await supabase.from("assessments").update({
          result:    partial,
          risk_tier: partial.risk_tier,
        }).eq("id", assessmentId);

        if (streamedGaps.length) {
          await send({ type: "done", assessment: partial });
        }
      }
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
