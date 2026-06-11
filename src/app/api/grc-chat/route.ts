import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  buildRegulatoryContextBlock,
  filterRegulatoryChunks,
  shouldRetrieveContext,
  type RegulatoryChunk,
} from "@/lib/rag";

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

const SYSTEM_PROMPT = `You are Norvar, a senior GRC advisor with expertise in AI regulation, privacy law, cybersecurity, computer vision, automated decisioning, and robotics safety globally.

Answer questions conversationally, accurately, and concisely. Cite specific articles and sections when relevant. Plain prose only — no markdown headers. Short paragraphs.

Behaviour:
- Greetings: reply in one brief, natural sentence. Do not introduce yourself at length or list what you can help with unless asked.
- When the user thanks you, says goodbye, or closes the thread ("all good", "thanks", etc.): one warm sentence only. Do not ask follow-up questions or re-offer help.
- Build on the conversation — do not repeat what was already said.
- Never mention retrieval systems, embeddings, regulatory context blocks, corrupted documents, binary data, or any internal tooling. If reference material is missing or unhelpful, answer from your own knowledge without commenting on why.
- If a question would benefit from a formal risk assessment against the user's specific deployment, suggest Norvar Assess briefly.

Out-of-scope questions (pure engineering, product comparisons, or code requests):
- Recognise when a question is outside GRC scope (e.g. "best database", "best LLM benchmark", "write me a port scanner").
- Reply in one or two sentences: briefly acknowledge scope, then redirect to compliance relevance or Norvar Assess if appropriate.
- Do not invent regulatory findings, fabricate citations, or write executable security tooling for out-of-scope requests.

Domain coverage — when relevant to the scenario, address:
- Privacy: GDPR lawful basis and Art. 6, CCPA/CPRA opt-out and sensitive PI, BIPA written policy and private right of action, HIPAA applicability for health data, FTC Section 5 enforcement risk, international transfers (SCCs, adequacy, Schrems II).
- AI governance: EU AI Act risk tier and Art. 5 prohibitions, NYC Local Law 144 bias audits, GDPR Art. 22, training-data lawful basis, GPAI transparency.
- Cybersecurity: GDPR Art. 28 processor/DPAs for vendors, 72-hour breach notification, DORA for financial sector, NIS2 for critical infrastructure, HIPAA Security Rule and BAAs, NIST CSF, SOC 2, ISO 27001 for supply chain, OT/IoT and safety-critical systems where applicable.`;

function sse(d: object) {
  return `data: ${JSON.stringify(d)}\n\n`;
}

function isAuditRequest(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SECRET;
  if (!secret) return false;
  return req.headers.get("x-audit-secret") === secret;
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

      const { messages, conversation_id, message } = await req.json();
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
