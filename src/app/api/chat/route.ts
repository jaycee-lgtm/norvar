import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Fetch document text from Supabase Storage for context injection
async function fetchDocumentText(docId: string, userId: string): Promise<string> {
  const { data: doc } = await supabase
    .from("documents")
    .select("file_path, name, file_type")
    .eq("id", docId)
    .eq("user_id", userId)
    .single();

  if (!doc?.file_path) return "";

  const { data: fileData } = await supabase.storage
    .from("documents")
    .download(doc.file_path);

  if (!fileData) return "";

  // For text-based files, read as text
  if (["txt", "md", "csv"].includes(doc.file_type ?? "")) {
    return `[Document: ${doc.name}]\n${await fileData.text()}`;
  }

  // For PDF/DOCX, return a placeholder — full extraction would need server-side parsing
  return `[Document attached: ${doc.name} (${doc.file_type?.toUpperCase()})]`;
}

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

// Audit bypass: allows the sprint-1 audit runner to call this route
// without a Clerk session, using a shared secret instead.
// Set AUDIT_SECRET in Vercel environment variables.
// Never expose this value in the frontend.
function isAuditRequest(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SECRET;
  if (!secret) return false;
  return req.headers.get("x-audit-secret") === secret;
}

export async function POST(req: NextRequest) {
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const send   = (d: object) => writer.write(enc.encode(sse(d)));

  (async () => {
    try {
      // Allow audit runner through if secret matches, otherwise require Clerk auth
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

      const { messages, assessment_id, new_user_message, message, document_ids } = await req.json();

      // Fetch and inject any referenced documents into context
      let docContext = "";
      if (Array.isArray(document_ids) && document_ids.length > 0 && userId) {
        const texts = await Promise.all(
          document_ids.map((id: string) => fetchDocumentText(id, userId)),
        );
        docContext = texts.filter(Boolean).join("\n\n");
      }

      // Audit runner sends a single `message` string — wrap it for Claude
      const resolvedMessages = messages?.length
        ? messages
        : message
          ? [{ role: "user", content: message }]
          : null;

      if (!resolvedMessages) {
        await send({ type: "error", text: "No messages" });
        await writer.close();
        return;
      }

      const systemPrompt = docContext
        ? `${SYSTEM_PROMPT}\n\nREFERENCED DOCUMENTS:\n${docContext}`
        : SYSTEM_PROMPT;

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 1000,
        system:     systemPrompt,
        messages:   resolvedMessages,
        stream:     true,
      });

      let fullText = "";
      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text ?? "";
          await send({ type: "token", text: event.delta.text });
        }
      }

      // Only persist to Supabase for real user sessions, not audit runs
      if (!auditMode && userId && assessment_id && new_user_message && fullText) {
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

      await send({ type: "done", text: fullText, conversation_id: assessment_id ?? null });
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
