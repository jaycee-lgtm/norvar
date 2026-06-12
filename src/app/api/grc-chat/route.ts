import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { isAuditRequest } from "@/lib/audit";
import { GRC_SYSTEM_PROMPT } from "@/lib/grc-prompt";
import {
  buildRegulatoryContextBlock,
  filterRegulatoryChunks,
  shouldRetrieveContext,
  type RegulatoryChunk,
} from "@/lib/rag";
import { buildDocumentContextBlock } from "@/lib/documents";

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

const SYSTEM_PROMPT = GRC_SYSTEM_PROMPT;

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
      const auditMode = isAuditRequest(req);
      let userId: string | null = null;
      if (!auditMode) {
        const authResult = await auth();
        userId = authResult.userId;
        if (!userId) {
          await send({ type: "error", text: "Unauthorised" });
          await writer.close();
          return;
        }
      }

      const { messages, conversation_id, message, folder_id, document_ids } = await req.json();
      const resolvedMessages: ChatMessage[] | null = messages?.length
        ? messages
        : message
          ? [{ role: "user", content: message }]
          : null;

      if (!resolvedMessages?.length) {
        await send({ type: "error", text: "No messages" });
        await writer.close();
        return;
      }

      const typedMessages = resolvedMessages;
      const lastUser = [...typedMessages].reverse().find(m => m.role === "user")?.content ?? "";

      let system = SYSTEM_PROMPT;

      if (Array.isArray(document_ids) && document_ids.length > 0 && userId) {
        const docContext = await buildDocumentContextBlock(document_ids, userId);
        if (docContext) system += docContext;
      }

      if (shouldRetrieveContext(lastUser)) {
        try {
          const embedding = await getEmbedding(lastUser);
          if (embedding.length > 0) {
            const { data: chunks } = await supabase.rpc("match_regulatory_chunks", {
              query_embedding: embedding,
              match_threshold: 0.42,
              match_count:     6,
            });
            const filtered = filterRegulatoryChunks((chunks ?? []) as RegulatoryChunk[]);
            const contextBlock = buildRegulatoryContextBlock(filtered);
            if (contextBlock) {
              system += `\n\nReference excerpts from the Norvar corpus (use only if clearly relevant; never quote garbage or mention this block):\n${contextBlock}`;
            }
          }
        } catch {
          // RAG is best-effort
        }
      }

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 1500,
        system,
        messages:   typedMessages,
        stream:     true,
      });

      let fullText = "";
      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text ?? "";
          await send({ type: "token", text: event.delta.text });
        }
      }

      if (!auditMode && fullText && userId) {
        const newMessages: ChatMessage[] = [...typedMessages, { role: "assistant", content: fullText }];
        if (conversation_id) {
          const { error: updateError } = await supabase.from("conversations")
            .update({ messages: newMessages, updated_at: new Date().toISOString() })
            .eq("id", conversation_id)
            .eq("user_id", userId);
          if (updateError) {
            console.error("Failed to update conversation:", updateError);
            await send({ type: "error", text: `Could not save chat: ${updateError.message}` });
            return;
          }
          await send({ type: "done", text: fullText, conversation_id });
        } else {
          const title = lastUser.length > 60 ? `${lastUser.slice(0, 57)}...` : lastUser;
          const { data: saved, error: insertError } = await supabase.from("conversations")
            .insert({ user_id: userId, title, messages: newMessages })
            .select("id")
            .single();
          if (insertError || !saved?.id) {
            console.error("Failed to create conversation:", insertError);
            await send({
              type: "error",
              text: insertError?.message
                ? `Could not save chat: ${insertError.message}`
                : "Could not save chat. Has the conversations table been created in Supabase?",
            });
            return;
          }
          if (folder_id) {
            await supabase.from("folder_items").upsert({
              folder_id,
              item_type: "chat",
              item_id:   saved.id,
            });
          }
          await send({ type: "done", text: fullText, conversation_id: saved.id });
        }
      } else {
        await send({ type: "done", text: fullText, conversation_id: conversation_id ?? null });
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
