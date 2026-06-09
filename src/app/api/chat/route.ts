import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SYSTEM_PROMPT = `
You are Norvar, a GRC (Governance, Risk and Compliance) intelligence assistant specialising in
technology regulation. You help users understand compliance requirements, interpret regulatory
gaps, and plan remediation steps.

The user has already received a compliance assessment. Answer their follow-up questions clearly
and concisely. Reference specific regulations and articles where relevant. Do not run a new
full assessment unless explicitly asked — just answer the question.

Keep responses focused and practical. Use plain prose, no markdown headers or bullet points.
`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const { userId } = await auth();
        if (!userId) {
          send({ type: "error", text: "Unauthorised" });
          controller.close();
          return;
        }

        const body = await req.json();
        const messages = body.messages as ChatMessage[] | undefined;
        const assessment_id = body.assessment_id as string | undefined;
        const new_user_message = body.new_user_message as string | undefined;

        if (!messages?.length) {
          send({ type: "error", text: "No messages" });
          controller.close();
          return;
        }

        const claudeStream = claude.messages.stream({
          model:      "claude-sonnet-4-6",
          max_tokens: 1000,
          system:     SYSTEM_PROMPT,
          messages,
        });

        let fullText = "";

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            send({ type: "token", text: event.delta.text });
          }
        }

        if (assessment_id && new_user_message && fullText) {
          const { data: row } = await supabase
            .from("assessments")
            .select("messages")
            .eq("id", assessment_id)
            .eq("user_id", userId)
            .single();

          if (row) {
            const existing = Array.isArray(row.messages) ? row.messages : [];
            const updated = [
              ...existing,
              { role: "user", content: new_user_message },
              { role: "chat", text: fullText },
            ];

            await supabase
              .from("assessments")
              .update({ messages: updated })
              .eq("id", assessment_id)
              .eq("user_id", userId);
          }
        }

        send({ type: "done", text: fullText });
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Chat failed";
        console.error("Chat error:", err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      Connection:            "keep-alive",
      "X-Accel-Buffering":   "no",
    },
  });
}
