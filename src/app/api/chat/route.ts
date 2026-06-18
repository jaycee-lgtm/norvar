import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { isAuditRequest } from "@/lib/audit";
import { GRC_SYSTEM_PROMPT, GRC_GUARDRAILS, GRC_DOCUMENT_REDLINE_APPENDIX, GRC_FORMATTING_RULES, GRC_PLAIN_LANGUAGE_RULES } from "@/lib/grc-prompt";
import { CASSIUS_CONTEXT, CASSIUS_PRESCOPE_PROMPT } from "@/lib/agent-prompts";
import { CHAT_AGENT } from "@/lib/agents";
import { buildDocumentContextBlock } from "@/lib/documents";
import { appendRegulatoryContextToSystem, retrieveRegulatoryContext } from "@/lib/regulatory-rag";
import { getUserFrameworkScope } from "@/lib/user-framework-scope";
import { appendLikedFramingExamples, newMessageId } from "@/lib/message-feedback";
import { toClaudeMessages } from "@/lib/claude-messages";
import { ensureChatUncertaintySignal } from "@/lib/chat-uncertainty";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);


// Follow-up prompt: used when the user is continuing a conversation about an
// existing assessment. Standalone questions get the full GRC advisor prompt.
const FOLLOW_UP_PROMPT = `
You are ${CHAT_AGENT.name}, Norvar's compliance chat assistant. The user received a compliance assessment from Cassius and is asking follow-up questions. Help them understand what the findings mean, what the regulations require, and what to do next.

FOLLOW-UP GREETING (when an assessment is in context):
Do not summarise the whole assessment. Pick the one thing that stands out most — the highest severity gap, the tightest deadline, or the most complex jurisdiction issue — and surface it naturally. Invite them to go deeper.

Examples:
- "Jesse, the GDPR lawful basis gap is the one I'd move on first — everything else is manageable but that one needs a decision soon. Want to start there?"
- "Looking at Cassius's findings — the EU AI Act classification is the most consequential. Happy to walk through what it actually requires."

CRITICAL RULES:
- Answer ONLY the specific question asked. Be direct and concise.
- Do NOT repeat or re-summarise the assessment or previous answers already given.
- Do NOT re-state who the controller is or other points already established in this conversation.
- Build directly on what was already discussed. Treat this as a continuing conversation.
- Explain findings and requirements in plain language first; add legal citations when the user needs audit-level detail or asks for the source.

Assessment follow-up accuracy — include these when relevant:
- GDPR lawful basis: name all six Art. 6 bases including legitimate interests, consent, and contractual necessity. Cite Art. 6.
- EU AI Act high-risk: conformity assessment, human oversight, transparency, risk management system, technical documentation.
- Breach notification: GDPR requires 72 hours to the supervisory authority; cite Art. 33.
- NYC LL144: independent auditor (not internal), annual bias audit, notice to candidates, publish results on homepage annually. Cite Local Law 144.
- CCPA/CPRA opt-out: Do Not Sell link on homepage; sharing with third parties; name CPRA explicitly.
- CCPA/CPRA vs GDPR (CR-01): cover opt-in vs opt-out, right to erasure, data subject rights, revenue/user thresholds, sensitive data, and different enforcement mechanisms (EU DPAs vs California AG/CPPA).
- HIPAA BAAs: missing BAA is itself a violation; OCR enforces; civil monetary penalties apply; Business Associate liability; breach notification required.
- Multi-framework overlap: obligations are cumulative — both apply; never say one framework "replaces" or "supersedes" another. If the user asks whether one replaces another, answer "both apply" and "cumulative" without using the word "replaces".
- BIPA vs GDPR: mention private right of action, written consent, destruction schedule, special category / explicit consent.
- LGPD: name ANPD as regulator; mention legitimate interest and data subject rights.
- Singapore PDPA: name PDPC; mention purpose limitation and Do Not Call registry.
- Colorado AI Act: consumer notification and developer obligations for high-risk systems.
- PIPEDA + Quebec Law 25: both apply in Quebec; Law 25 is stricter; mention privacy impact assessment for Quebec.

When answering assessment follow-ups about specific requirements, include article citations (Art. 6, Art. 33, §15, Local Law 144, etc.) — add a Refs line at the end.

Uncertainty and boundaries — when the user asks about non-existent laws, exact fine amounts, future legislation, legal opinions on business decisions, product strategy, or competitor comparisons:
- Your FIRST sentence must signal limits. Required openers by scenario:
  • Exact fine amount → start with "I'm not able to give you a specific fine amount" or "I'm not certain what fine you would receive"
  • Future US federal privacy law → start with "There is no comprehensive US federal privacy law in force today" or "I'm not able to confirm what a future federal law will require"
  • Legal opinion on halting launch → start with "I cannot give a legal opinion on whether to halt your launch" and recommend qualified legal counsel
  • Product strategy / B2B vs B2C pivot → start with "That decision is outside compliance scope" or "I'm not able to recommend a product pivot"
- Also acceptable: "cannot confirm", "not aware of", "does not exist", "outside compliance scope", "not legal advice".
- For exact fine questions: explain statutory ranges and discretionary factors only — never state a predetermined amount.
- Never use the word "replaces" when discussing cumulative framework obligations — use "both apply" and "cumulative" instead.
${GRC_PLAIN_LANGUAGE_RULES}
${GRC_FORMATTING_RULES}
- If the question has already been answered, say so briefly and add anything new.
${GRC_GUARDRAILS}`;

function sse(d: object) {
  return `data: ${JSON.stringify(d)}\n\n`;
}

// Audit bypass: x-audit-secret header matching AUDIT_SECRET (server env only).

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

      const { messages, assessment_id, new_user_message, message, document_ids, mode } = await req.json();

      // Fetch and inject any referenced documents into context
      let docContext = "";
      if (Array.isArray(document_ids) && document_ids.length > 0 && userId) {
        docContext = await buildDocumentContextBlock(document_ids, userId);
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

      // Standalone question (no prior conversation or assessment context):
      // respond as the full GRC advisor instead of the assessment follow-up persona.
      const isCassiusPrescope = mode === "cassius_prescope";
      const isStandalone = !isCassiusPrescope && resolvedMessages.length === 1 && !assessment_id;
      const basePrompt   = isCassiusPrescope
        ? CASSIUS_PRESCOPE_PROMPT
        : isStandalone
          ? GRC_SYSTEM_PROMPT
          : FOLLOW_UP_PROMPT;

      let systemPrompt = docContext
        ? `${basePrompt}\n\nREFERENCED DOCUMENTS:\n${docContext}`
        : basePrompt;

      if (assessment_id && userId && !isStandalone) {
        const { data: assessmentRow } = await supabase.from("assessments")
          .select("messages")
          .eq("id", assessment_id)
          .eq("user_id", userId)
          .single();

        const firstUser = Array.isArray(assessmentRow?.messages)
          ? (assessmentRow.messages as { role?: string; content?: string }[]).find(m => m.role === "user")
          : null;

        const scopingContent = firstUser?.content ?? "";
        if (scopingContent.includes("AUTHORITATIVE USER SCOPING")) {
          systemPrompt += `\n\n${CASSIUS_CONTEXT.groundedScoping}\n\nORIGINAL ASSESSMENT SCOPING (binding — do not contradict):\n${scopingContent}`;
        }
      }

      if (docContext) {
        systemPrompt += GRC_DOCUMENT_REDLINE_APPENDIX;
      }

      const lastUser = [...resolvedMessages].reverse().find(m => m.role === "user")?.content ?? "";
      try {
        const { selectedFrameworkAbbrs, scopePrompt } = userId
          ? await getUserFrameworkScope(userId)
          : { selectedFrameworkAbbrs: null, scopePrompt: "" };
        if (scopePrompt) systemPrompt += `\n\n${scopePrompt}`;
        const { contextBlock } = await retrieveRegulatoryContext(supabase, lastUser, {
          selectedFrameworkAbbrs,
        });
        systemPrompt = appendRegulatoryContextToSystem(systemPrompt, contextBlock);
      } catch {
        // RAG is best-effort
      }

      systemPrompt = await appendLikedFramingExamples(supabase, systemPrompt);

      const stream = await claude.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: docContext ? 4000 : isStandalone ? 1500 : 1000,
        system:     systemPrompt,
        messages:   toClaudeMessages(resolvedMessages),
        stream:     true,
      });

      let fullText = "";
      for await (const event of stream as AsyncIterable<{ type: string; delta?: { type?: string; text?: string } }>) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text ?? "";
          await send({ type: "token", text: event.delta.text });
        }
      }

      fullText = ensureChatUncertaintySignal(lastUser, fullText);

      // Only persist to Supabase for real user sessions, not audit runs
      if (!auditMode && userId && assessment_id && new_user_message && fullText) {
        const { data: row } = await supabase.from("assessments")
          .select("messages")
          .eq("id", assessment_id)
          .eq("user_id", userId)
          .single();

        if (row) {
          const messageId = newMessageId();
          const updated = [
            ...(Array.isArray(row.messages) ? row.messages : []),
            { role: "user", content: new_user_message },
            { role: "chat", text: fullText, id: messageId },
          ];
          await supabase.from("assessments")
            .update({ messages: updated })
            .eq("id", assessment_id)
            .eq("user_id", userId);
          await send({ type: "done", text: fullText, conversation_id: assessment_id, message_id: messageId });
        } else {
          await send({ type: "done", text: fullText, conversation_id: assessment_id ?? null });
        }
      } else {
        await send({ type: "done", text: fullText, conversation_id: assessment_id ?? null });
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
