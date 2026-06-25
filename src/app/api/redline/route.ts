import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { isAuditRequest } from "@/lib/audit";
import { fetchDocumentText } from "@/lib/documents";
import { generateRedlineText } from "@/lib/redline-generate";
import {
  CASSIUS_REDLINE_PROMPT,
  NORA_REDLINE_PROMPT,
  detectAgreementType,
  enrichRedlineFromContract,
  normalizeRedlineOutput,
  parseRedlineJSON,
  stripDocumentBlock,
  type RedlineOutput,
} from "@/lib/redline";
import {
  normalizeRedlineReviewModelChoice,
} from "@/lib/redline-models";
import { resolveReviewReviewModel } from "@/lib/review-models";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const maxDuration = 300;

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
      const auditMode = isAuditRequest(req);
      let userId = "audit-runner";
      if (!auditMode) {
        const { userId: uid } = await auth();
        if (!uid) {
          await send({ type: "error", text: "Unauthorised" });
          await writer.close();
          return;
        }
        userId = uid;
      }

      const body = await req.json();
      const {
        contract_text  = "",
        document_id    = "",
        agent          = "cassius" as "cassius" | "nora",
        review_model   = undefined as unknown,
        jurisdictions  = [] as string[],
        agreement_type = "",
      } = body;

      let text = contract_text.trim();

      if (!text && document_id) {
        await send({ type: "status", text: "Fetching your document from Documents..." });
        text = stripDocumentBlock(await fetchDocumentText(document_id, userId));
      } else if (text) {
        await send({
          type: "status",
          text: `Read ${text.length.toLocaleString()} characters from the agreement.`,
        });
      }

      if (text.length < 100) {
        await send({ type: "error", text: "Agreement text is too short or could not be read." });
        await writer.close();
        return;
      }

      const detectedType = agreement_type || detectAgreementType(text);

      const modelChoice = review_model !== undefined
        ? normalizeRedlineReviewModelChoice(review_model)
        : auditMode
          ? "sonnet"
          : "auto";

      const resolved = resolveReviewReviewModel(modelChoice, {
        agreementType:     detectedType,
        jurisdictions,
        contractCharCount: text.length,
        contractText:      text,
      });
      const {
        agent: resolvedAgent,
        provider,
        modelId,
        repairProvider,
        repairModelId,
        maxTokens,
        displayName,
        statusLead,
      } = resolved;

      await send({ type: "status", text: `Identified this as a ${detectedType}.` });

      if (jurisdictions.length > 0) {
        await send({
          type: "status",
          text: `Applying jurisdiction context: ${jurisdictions.join(", ")}.`,
        });
      }

      if (text.length > 24000) {
        await send({
          type: "status",
          text: "Document is long — reviewing the first 24,000 characters.",
        });
      }

      const jurisdictionHint = jurisdictions.length > 0
        ? `\nJurisdiction context: ${jurisdictions.join(", ")}`
        : "";
      const typeHint = agreement_type
        ? `\nAgreement type hint: ${agreement_type}`
        : "";

      const userMsg = [
        `Review the following ${detectedType} clause by clause.${jurisdictionHint}${typeHint}`,
        "",
        "AGREEMENT TEXT:",
        text.slice(0, 24000),
        text.length > 24000 ? "\n[Note: Agreement truncated at 24,000 characters. Review covers the text above.]" : "",
      ].join("\n");

      const systemPrompt = resolvedAgent === "nora" ? NORA_REDLINE_PROMPT : CASSIUS_REDLINE_PROMPT;

      await send({
        type: "status",
        text: `${statusLead}...`,
      });

      const pulse = setInterval(() => {
        void send({
          type: "pulse",
          text: `${displayName} is still reviewing clauses — this can take a few minutes...`,
        });
      }, 20000);

      let response;
      try {
        response = await generateRedlineText({
          provider,
          modelId,
          systemPrompt,
          userMsg,
          maxTokens,
        });
      } finally {
        clearInterval(pulse);
      }

      await send({ type: "status", text: "Parsing findings and suggested language..." });

      const rawText = response.text;

      let redline: RedlineOutput;
      try {
        redline = enrichRedlineFromContract(
          normalizeRedlineOutput(parseRedlineJSON(rawText), resolvedAgent, detectedType),
          text,
        );
      } catch (parseErr) {
        console.error("Redline parse failed:", parseErr, {
          truncated: response.truncated,
          length:      rawText.length,
        });

        if (response.truncated || rawText.length > 0) {
          await send({
            type: "status",
            text: "Response was incomplete — finishing the review...",
          });

          try {
            const repair = await generateRedlineText({
              provider:     repairProvider,
              modelId:      repairModelId,
              maxTokens:    12_000,
              systemPrompt: [
                systemPrompt,
                "",
                "The previous response was truncated or invalid JSON.",
                "Return ONLY one complete valid JSON object in the required redline schema.",
                "Include at most 12 highest-severity clauses.",
                "Keep original_text under 300 characters and suggested_text under 500 characters.",
              ].join("\n"),
              userMsg: [
                userMsg,
                "",
                "TRUNCATED OR INVALID MODEL OUTPUT TO REPAIR:",
                rawText.slice(-14000),
              ].join("\n"),
            });

            redline = enrichRedlineFromContract(
              normalizeRedlineOutput(parseRedlineJSON(repair.text), resolvedAgent, detectedType),
              text,
            );
          } catch (repairErr) {
            console.error("Redline repair failed:", repairErr);
            await send({
              type: "error",
              text: "Could not complete the review output. Please try again with a shorter document or paste a section at a time.",
            });
            await writer.close();
            return;
          }
        } else {
          await send({
            type: "error",
            text: "Failed to parse redline output. Please try again.",
          });
          await writer.close();
          return;
        }
      }

      if (!auditMode) {
        await send({ type: "status", text: "Saving your review..." });

        const row = {
          user_id:        userId,
          agent:          resolvedAgent,
          agreement_type: redline.agreement_type,
          governing_law:  redline.governing_law,
          overall_status: redline.overall_status,
          result:         redline,
          followups:      {},
          source_text:    text.slice(0, 120000),
          document_id:    document_id || null,
          created_at:     new Date().toISOString(),
        };
        let { error: insertErr } = await supabase.from("redlines").insert(row);
        if (insertErr?.message.includes("followups") || insertErr?.message.includes("source_text")) {
          const { followups: _f, source_text: _s, ...fallbackRow } = row;
          ({ error: insertErr } = await supabase.from("redlines").insert(fallbackRow));
        }
        if (insertErr) {
          console.error("Redline save error:", insertErr);
          await send({
            type: "status",
            text: `Review completed but could not be saved: ${insertErr.message}`,
          });
        }
      }

      const issueCount = redline.clauses?.length ?? 0;
      await send({
        type: "status",
        text: issueCount
          ? `Found ${issueCount} clause${issueCount === 1 ? "" : "s"} to review.`
          : "Review complete — no major issues flagged.",
      });

      await send({ type: "done", redline });
    } catch (err: unknown) {
      console.error("Redline error:", err);
      await send({ type: "error", text: err instanceof Error ? err.message : "Redline failed" });
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
