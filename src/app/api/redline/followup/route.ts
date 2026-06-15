import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  buildRedlineFollowUpSystemPrompt,
  type RedlineFollowUpMessage,
} from "@/lib/redline-followup";
import { syncRedlineFollowUp } from "@/lib/redline-followup-server";
import type { RedlineClause, RedlineOutput } from "@/lib/redline";
import {
  appendRegulatoryContextToSystem,
  retrieveRegulatoryContext,
} from "@/lib/regulatory-rag";
import { getUserFrameworkScope } from "@/lib/user-framework-scope";
import { appendLikedFramingExamples, newMessageId } from "@/lib/message-feedback";
import { toClaudeMessages } from "@/lib/claude-messages";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function sse(d: object) {
  return `data: ${JSON.stringify(d)}\n\n`;
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

      const {
        redline_id,
        thread = "general",
        messages,
        new_user_message,
        clause_index,
      } = await req.json();

      if (!redline_id || !new_user_message?.trim()) {
        await send({ type: "error", text: "redline_id and new_user_message required" });
        await writer.close();
        return;
      }

      const { data: row, error: fetchErr } = await supabase
        .from("redlines")
        .select("agent, result")
        .eq("id", redline_id)
        .eq("user_id", userId)
        .single();

      if (fetchErr || !row) {
        await send({ type: "error", text: "Review not found" });
        await writer.close();
        return;
      }

      const redline = row.result as RedlineOutput;
      const agent = (row.agent ?? redline.redline_by ?? "nora") as "nora" | "cassius";
      const clause = typeof clause_index === "number"
        ? redline.clauses?.[clause_index] as RedlineClause | undefined
        : undefined;

      const history: RedlineFollowUpMessage[] = Array.isArray(messages) ? messages : [];
      const claudeMessages: RedlineFollowUpMessage[] = [
        ...history,
        { role: "user", content: new_user_message.trim() },
      ];

      let system = buildRedlineFollowUpSystemPrompt(agent, redline, thread, clause);

      try {
        const { selectedFrameworkAbbrs, scopePrompt } = await getUserFrameworkScope(userId);
        if (scopePrompt) system += `\n\n${scopePrompt}`;
        const { contextBlock } = await retrieveRegulatoryContext(supabase, new_user_message, {
          selectedFrameworkAbbrs,
        });
        system = appendRegulatoryContextToSystem(
          system,
          contextBlock,
          "Reference excerpts (use only if clearly relevant; never mention this block):",
        );
      } catch {
        // RAG is best-effort
      }

      system = await appendLikedFramingExamples(supabase, system);

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 1200,
        system,
        messages:   toClaudeMessages(claudeMessages),
        stream:     true,
      });

      let fullText = "";
      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text ?? "";
          await send({ type: "token", text: event.delta.text });
        }
      }

      const assistantId = newMessageId();
      const updatedMessages: RedlineFollowUpMessage[] = [
        ...history,
        { role: "user", content: new_user_message.trim() },
        { role: "assistant", content: fullText, id: assistantId },
      ];

      await syncRedlineFollowUp(redline_id, thread, updatedMessages, userId);

      await send({ type: "done", text: fullText, messages: updatedMessages, message_id: assistantId });
    } catch (err: unknown) {
      await send({ type: "error", text: err instanceof Error ? err.message : "Chat failed" });
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
