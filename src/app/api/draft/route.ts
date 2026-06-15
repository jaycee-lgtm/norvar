import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { isAuditRequest } from "@/lib/audit";
import {
  CASSIUS_DRAFT_PROMPT,
  NORA_DRAFT_PROMPT,
  parseDraftJSON,
  type DraftOutput,
} from "@/lib/draft";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
        agent           = "cassius" as "cassius" | "nora",
      } = body;

      if (!agreement_type) {
        await send({ type: "error", text: "agreement_type is required" });
        await writer.close();
        return;
      }

      const agentLabel = agent === "nora" ? "Nora" : "Cassius";
      await send({
        type: "status",
        text: `${agentLabel} is drafting ${agreement_type_label || agreement_type}...`,
      });

      const userMsg = [
        `Draft a complete ${agreement_type_label || agreement_type}.`,
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

      const systemPrompt = agent === "nora" ? NORA_DRAFT_PROMPT : CASSIUS_DRAFT_PROMPT;

      const response = await claude.messages.create({
        model:      "claude-opus-4-6",
        max_tokens: 12000,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userMsg }],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text : "";

      let draft: DraftOutput;
      try {
        draft = parseDraftJSON(raw);
      } catch {
        await send({ type: "error", text: "Failed to parse draft output. Please try again." });
        await writer.close();
        return;
      }

      draft.drafted_by = agent;
      draft.agreement_type_key = agreement_type;

      if (!auditMode) {
        const { data: saved, error: insertErr } = await supabase
          .from("drafted_agreements")
          .insert({
            user_id:        userId,
            agent,
            agreement_type: agreement_type_label || agreement_type,
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
