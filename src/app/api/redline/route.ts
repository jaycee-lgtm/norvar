import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { isAuditRequest } from "@/lib/audit";
import { fetchDocumentText } from "@/lib/documents";
import {
  CASSIUS_REDLINE_PROMPT,
  NORA_REDLINE_PROMPT,
  detectAgreementType,
  normalizeRedlineOutput,
  parseRedlineJSON,
  stripDocumentBlock,
  type RedlineOutput,
} from "@/lib/redline";

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
        contract_text  = "",
        document_id    = "",
        agent          = "cassius" as "cassius" | "nora",
        jurisdictions  = [] as string[],
        agreement_type = "",
      } = body;

      let text = contract_text.trim();
      if (!text && document_id) {
        await send({ type: "status", text: "Fetching document..." });
        text = stripDocumentBlock(await fetchDocumentText(document_id, userId));
      }

      if (text.length < 100) {
        await send({ type: "error", text: "Agreement text is too short or could not be read." });
        await writer.close();
        return;
      }

      const detectedType = agreement_type || detectAgreementType(text);
      await send({ type: "status", text: `Reviewing ${detectedType}...` });

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

      const systemPrompt = agent === "nora" ? NORA_REDLINE_PROMPT : CASSIUS_REDLINE_PROMPT;

      await send({
        type: "status",
        text: `${agent === "nora" ? "Nora" : "Cassius"} is reviewing clauses...`,
      });

      const response = await claude.messages.create({
        model:      "claude-opus-4-6",
        max_tokens: 8000,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userMsg }],
      });

      const rawText = response.content[0].type === "text" ? response.content[0].text : "";

      let redline: RedlineOutput;
      try {
        redline = normalizeRedlineOutput(parseRedlineJSON(rawText), agent, detectedType);
      } catch {
        await send({ type: "error", text: "Failed to parse redline output. Please try again." });
        await writer.close();
        return;
      }

      if (!auditMode) {
        await supabase.from("redlines").insert({
          user_id:        userId,
          agent,
          agreement_type: redline.agreement_type,
          governing_law:  redline.governing_law,
          overall_status: redline.overall_status,
          result:         redline,
          followups:      {},
          document_id:    document_id || null,
          created_at:     new Date().toISOString(),
        });
      }

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
