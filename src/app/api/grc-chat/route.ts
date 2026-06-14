import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { isAuditRequest } from "@/lib/audit";
import { GRC_SYSTEM_PROMPT, GRC_DOCUMENT_REDLINE_APPENDIX } from "@/lib/grc-prompt";
import {
  appendRegulatoryContextToSystem,
  retrieveRegulatoryContext,
} from "@/lib/regulatory-rag";
import { buildDocumentContextBlock } from "@/lib/documents";
import { getUserFrameworkScope } from "@/lib/user-framework-scope";
import { generateChatTitle } from "@/lib/generate-thread-title";
import { appendLikedFramingExamples, newMessageId } from "@/lib/message-feedback";
import { toClaudeMessages, userFacingClaudeError } from "@/lib/claude-messages";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = GRC_SYSTEM_PROMPT;

function sse(d: object) {
  return `data: ${JSON.stringify(d)}\n\n`;
}

type ChatMessage = { role: "user" | "assistant"; content: string; id?: string; feedback?: "up" | "down" | null };

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

      const { messages, conversation_id, message, folder_id, document_ids, contract_text } = await req.json();
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
      let hasDocumentContext = false;

      if (Array.isArray(document_ids) && document_ids.length > 0 && userId) {
        const docContext = await buildDocumentContextBlock(document_ids, userId);
        if (docContext) {
          system += docContext;
          hasDocumentContext = true;
        }
      }

      const inlineContract = typeof contract_text === "string" ? contract_text.trim() : "";
      if (inlineContract) {
        system += `\n\nCONTRACT (uploaded for this message):\n${inlineContract.slice(0, 12000)}`;
        hasDocumentContext = true;
      }

      if (hasDocumentContext) {
        system += GRC_DOCUMENT_REDLINE_APPENDIX;
      }

      try {
        const { selectedFrameworkAbbrs, scopePrompt } = userId
          ? await getUserFrameworkScope(userId)
          : { selectedFrameworkAbbrs: null, scopePrompt: "" };
        if (scopePrompt) system += `\n\n${scopePrompt}`;
        const { contextBlock } = await retrieveRegulatoryContext(supabase, lastUser, {
          selectedFrameworkAbbrs,
        });
        system = appendRegulatoryContextToSystem(system, contextBlock);
      } catch {
        // RAG is best-effort
      }

      system = await appendLikedFramingExamples(supabase, system);

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: hasDocumentContext ? 4000 : 1500,
        system,
        messages:   toClaudeMessages(typedMessages),
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
        const assistantId = newMessageId();
        const newMessages: ChatMessage[] = [
          ...typedMessages,
          { role: "assistant", content: fullText, id: assistantId },
        ];
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
          await send({ type: "done", text: fullText, conversation_id, message_id: assistantId });
        } else {
          const placeholderTitle = lastUser.trim().slice(0, 60) || "New chat";
          const { data: saved, error: insertError } = await supabase.from("conversations")
            .insert({ user_id: userId, title: placeholderTitle, messages: newMessages })
            .select("id")
            .maybeSingle();
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
          await send({ type: "done", text: fullText, conversation_id: saved.id, message_id: assistantId });
          void generateChatTitle(lastUser, fullText).then(async title => {
            if (!title || title === placeholderTitle) return;
            await supabase.from("conversations")
              .update({ title })
              .eq("id", saved.id)
              .eq("user_id", userId);
          }).catch(err => console.error("Background title update failed:", err));
        }
      } else {
        await send({ type: "done", text: fullText, conversation_id: conversation_id ?? null });
      }
    } catch (err: unknown) {
      const text = err instanceof Error ? userFacingClaudeError(err.message) : "Chat failed";
      await send({ type: "error", text });
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
