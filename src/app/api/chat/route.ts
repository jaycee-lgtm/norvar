import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `
You are Norvar, a GRC compliance assistant. The user received a compliance assessment and is asking follow-up questions.

CRITICAL RULES:
- Answer ONLY the specific question asked. Be direct and concise.
- Do NOT repeat or re-summarise the assessment or previous answers already given.
- Do NOT re-state who the controller is or other points already established in this conversation.
- Build directly on what was already discussed. Treat this as a continuing conversation.
- Reference specific regulation articles when relevant.
- Plain prose only. No markdown headers. Short focused paragraphs.
- If the question has already been answered, say so briefly and add anything new.
`;

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

      const { messages, assessment_id, new_user_message } = await req.json();
      if (!messages?.length) {
        await send({ type: "error", text: "No messages" });
        await writer.close();
        return;
      }

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 1000,
        system:     SYSTEM_PROMPT,
        messages,
        stream:     true,
      });

      let fullText = "";
      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text ?? "";
          await send({ type: "token", text: event.delta.text });
        }
      }

      if (assessment_id && new_user_message && fullText) {
        const { data: row } = await supabase.from("assessments")
          .select("messages")
          .eq("id", assessment_id)
          .eq("user_id", userId)
          .single();

        if (row) {
          const updated = [
            ...(Array.isArray(row.messages) ? row.messages : []),
            { role: "user", content: new_user_message },
            { role: "chat", text: fullText },
          ];
          await supabase.from("assessments")
            .update({ messages: updated })
            .eq("id", assessment_id)
            .eq("user_id", userId);
        }
      }

      await send({ type: "done", text: fullText, conversation_id: assessment_id });
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
