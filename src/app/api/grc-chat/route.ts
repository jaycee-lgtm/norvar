import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

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

const SYSTEM_PROMPT = `
You are Norvar, a senior GRC advisor with expertise in AI regulation, privacy law, cybersecurity,
computer vision, automated decisioning, and robotics safety globally.

Answer questions conversationally, accurately, and concisely. Cite specific articles and sections
when relevant. Plain prose, no markdown headers. Short paragraphs.

If a question would benefit from a formal risk assessment against the user's specific deployment,
suggest they use Norvar Assess.

Build on the conversation — do not repeat what was already said.
`;

function sse(d: object) {
  return `data: ${JSON.stringify(d)}\n\n`;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

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

      const { messages, conversation_id } = await req.json();
      if (!messages?.length) {
        await send({ type: "error", text: "No messages" });
        await writer.close();
        return;
      }

      const typedMessages = messages as ChatMessage[];
      const lastUser = [...typedMessages].reverse().find(m => m.role === "user")?.content ?? "";

      let contextText = "";
      try {
        const embedding = await getEmbedding(lastUser);
        const { data: chunks } = await supabase.rpc("match_regulatory_chunks", {
          query_embedding: embedding,
          match_threshold: 0.38,
          match_count:     6,
        });
        if (chunks?.length) {
          contextText = "\n\nRELEVANT REGULATORY CONTEXT:\n" +
            (chunks as { reg_abbr: string; reg_name: string; chunk_text: string }[])
              .map((c, i) => `[${i + 1}] ${c.reg_abbr} — ${c.reg_name}\n${c.chunk_text}`)
              .join("\n\n");
        }
      } catch {
        // RAG is best-effort
      }

      const claudeMessages = typedMessages.map((m, i) => {
        if (i === typedMessages.length - 1 && m.role === "user" && contextText) {
          return { role: "user" as const, content: m.content + contextText };
        }
        return { role: m.role, content: m.content };
      });

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 1500,
        system:     SYSTEM_PROMPT,
        messages:   claudeMessages,
        stream:     true,
      });

      let fullText = "";
      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text ?? "";
          await send({ type: "token", text: event.delta.text });
        }
      }

      if (fullText) {
        const newMessages: ChatMessage[] = [...typedMessages, { role: "assistant", content: fullText }];
        if (conversation_id) {
          await supabase.from("conversations")
            .update({ messages: newMessages, updated_at: new Date().toISOString() })
            .eq("id", conversation_id)
            .eq("user_id", userId);
          await send({ type: "done", text: fullText, conversation_id });
        } else {
          const title = lastUser.length > 60 ? `${lastUser.slice(0, 57)}...` : lastUser;
          const { data: saved } = await supabase.from("conversations")
            .insert({ user_id: userId, title, messages: newMessages })
            .select("id")
            .single();
          await send({ type: "done", text: fullText, conversation_id: saved?.id });
        }
      } else {
        await send({ type: "done", text: "", conversation_id });
      }
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
