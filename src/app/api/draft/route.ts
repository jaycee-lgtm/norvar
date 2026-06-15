import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { isAuditRequest } from "@/lib/audit";
import {
  CASSIUS_DRAFT_PROMPT,
  NORA_DRAFT_PROMPT,
  parseDraftJSON,
  type DraftOutput,
} from "@/lib/draft";
import { generateRedlineText } from "@/lib/redline-generate";
import {
  normalizeRedlineReviewModelChoice,
  resolveRedlineReviewModel,
} from "@/lib/redline-models";

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
        agreement_type,
        agreement_type_label,
        provider_name   = "[Provider Name]",
        customer_name   = "[Customer Name]",
        jurisdictions   = [] as string[],
        context         = "",
        include_clauses = [] as string[],
        review_model    = undefined as unknown,
        agent           = undefined as "cassius" | "nora" | undefined,
      } = body;

      if (!agreement_type) {
        await send({ type: "error", text: "agreement_type is required" });
        await writer.close();
        return;
      }

      const modelChoice = review_model !== undefined
        ? normalizeRedlineReviewModelChoice(review_model)
        : agent === "nora"
        ? "sonnet"
        : agent === "cassius"
        ? "opus"
        : normalizeRedlineReviewModelChoice(undefined);

      const resolved = resolveRedlineReviewModel(modelChoice, 0);
      const {
        agent: resolvedAgent,
        provider,
        modelId,
        repairProvider,
        repairModelId,
        maxTokens,
        displayName,
      } = resolved;

      const typeLabel = agreement_type_label || agreement_type;
      await send({
        type: "status",
        text: `${displayName} is drafting ${typeLabel}...`,
      });

      const userMsg = [
        `Draft a complete ${typeLabel}.`,
        "",
        "Parties:",
        `- Provider: ${provider_name}`,
        `- Customer: ${customer_name}`,
        jurisdictions.length > 0 ? `\nJurisdictions: ${jurisdictions.join(", ")}` : "",
        context ? `\nAdditional context: ${context}` : "",
        include_clauses.length > 0
          ? `\nEnsure these provisions are included: ${include_clauses.join(", ")}`
          : "",
        "",
        "Return a complete, ready-to-review first draft with all clauses written in full.",
        `Use "${provider_name}" and "${customer_name}" throughout.`,
      ].filter(Boolean).join("\n");

      const systemPrompt = resolvedAgent === "nora" ? NORA_DRAFT_PROMPT : CASSIUS_DRAFT_PROMPT;

      const pulse = setInterval(() => {
        void send({
          type: "pulse",
          text: `${displayName} is still drafting clauses — this can take a few minutes...`,
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

      await send({ type: "status", text: "Parsing draft sections..." });

      let rawText = response.text;
      let draft: DraftOutput;

      try {
        draft = parseDraftJSON(rawText);
      } catch (parseErr) {
        console.error("Draft parse failed:", parseErr, {
          truncated: response.truncated,
          length:      rawText.length,
        });

        if (response.truncated || rawText.length > 0) {
          await send({
            type: "status",
            text: "Response was incomplete — finishing the draft...",
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
                "Return ONLY one complete valid JSON object in the required draft schema.",
                "Include all sections with full clause text.",
              ].join("\n"),
              userMsg: [
                userMsg,
                "",
                "TRUNCATED OR INVALID MODEL OUTPUT TO REPAIR:",
                rawText.slice(-14000),
              ].join("\n"),
            });

            draft = parseDraftJSON(repair.text);
          } catch (repairErr) {
            console.error("Draft repair failed:", repairErr);
            await send({
              type: "error",
              text: "Could not complete the draft output. Please try again.",
            });
            await writer.close();
            return;
          }
        } else {
          await send({
            type: "error",
            text: "Failed to parse draft output. Please try again.",
          });
          await writer.close();
          return;
        }
      }

      draft.drafted_by = resolvedAgent;
      draft.agreement_type_key = agreement_type;

      if (!auditMode) {
        await send({ type: "status", text: "Saving your draft..." });

        const { data: saved, error: insertErr } = await supabase
          .from("drafted_agreements")
          .insert({
            user_id:        userId,
            agent:          resolvedAgent,
            agreement_type: typeLabel,
            governing_law:  draft.governing_law || null,
            result:         draft,
            created_at:     new Date().toISOString(),
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("Draft save error:", insertErr);
          await send({
            type: "error",
            text: "Draft completed but could not be saved. Run the drafted_agreements migration in Supabase.",
          });
          await writer.close();
          return;
        }
        if (saved?.id) draft.id = saved.id;
      }

      await send({ type: "done", draft });

    } catch (err: unknown) {
      console.error("Draft error:", err);
      await send({ type: "error", text: err instanceof Error ? err.message : "Draft failed" });
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
