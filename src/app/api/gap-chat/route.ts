import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { syncGapChatToAssessment, gapKeyFromTitle } from "@/lib/gap-chat";
import { getActiveOrganizationId, isOrgMember } from "@/lib/clerk-org";
import {
  appendRegulatoryContextToSystem,
  retrieveRegulatoryContext,
} from "@/lib/regulatory-rag";
import { getUserFrameworkScope } from "@/lib/user-framework-scope";
import { GRC_FORMATTING_RULES } from "@/lib/grc-prompt";
import { appendLikedFramingExamples, newMessageId } from "@/lib/message-feedback";

const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ChatMessage = { role: "user" | "assistant"; content: string; id?: string; feedback?: "up" | "down" | null };

type GapPayload = {
  title:              string;
  severity:           string;
  domain?:            string;
  detail?:            string | null;
  frameworks?:        string[];
  remediation_steps?: string | null;
};

function buildGapContext(gap: GapPayload) {
  return [
    `Title: ${gap.title}`,
    `Severity: ${gap.severity}`,
    gap.domain ? `Domain: ${gap.domain}` : null,
    gap.frameworks?.length ? `Frameworks: ${gap.frameworks.join(", ")}` : null,
    gap.detail ? `Issue: ${gap.detail}` : null,
    gap.remediation_steps ? `Recommended remediation: ${gap.remediation_steps}` : null,
  ].filter(Boolean).join("\n");
}

const SYSTEM_BASE = `You are Norvar, a senior GRC remediation advisor. The user is working on one specific compliance gap from their assessment.

Help them understand how to remediate this gap with practical, actionable guidance.

Rules:
- Answer only what was asked. Be direct and concise.
- Reference specific regulation articles when relevant.
${GRC_FORMATTING_RULES}
- Build on prior messages in this thread — do not repeat the gap summary unless asked.
- Focus on implementation steps, ownership, timelines, and evidence — not re-running the assessment.`;

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
      const { userId, orgId } = await auth();
      if (!userId) {
        await send({ type: "error", text: "Unauthorised" });
        await writer.close();
        return;
      }

      const activeOrgId = await getActiveOrganizationId(userId, orgId);

      const {
        messages,
        new_user_message,
        gap,
        remediation_id,
        assessment_id,
        gap_key,
      } = await req.json();

      if (!gap?.title || !new_user_message?.trim()) {
        await send({ type: "error", text: "gap and new_user_message required" });
        await writer.close();
        return;
      }

      const history: ChatMessage[] = Array.isArray(messages) ? messages : [];
      const claudeMessages: ChatMessage[] = [
        ...history,
        { role: "user", content: new_user_message.trim() },
      ];

      let system = `${SYSTEM_BASE}\n\nGAP CONTEXT:\n${buildGapContext(gap as GapPayload)}`;

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

      const assistantId = newMessageId();
      const updatedMessages: ChatMessage[] = [
        ...history,
        { role: "user", content: new_user_message.trim() },
        { role: "assistant", content: fullText, id: assistantId },
      ];

      let linkedAssessmentId = assessment_id as string | undefined;
      let linkedGapKey       = gap_key as string | undefined;

      if (remediation_id) {
        const { data: item } = await supabase
          .from("remediation_items")
          .select("created_by, assigned_to, assessment_id, gap_key, gap_title, gap_severity")
          .eq("id", remediation_id)
          .single();

        if (!item) {
          await send({ type: "error", text: "Remediation item not found" });
          await writer.close();
          return;
        }

        let canAccess =
          item.created_by === userId
          || (item.assigned_to ?? []).includes(userId);

        if (!canAccess && activeOrgId && await isOrgMember(activeOrgId, userId)) {
          if (await isOrgMember(activeOrgId, item.created_by)) {
            canAccess = true;
          } else {
            for (const assigneeId of item.assigned_to ?? []) {
              if (await isOrgMember(activeOrgId, assigneeId)) {
                canAccess = true;
                break;
              }
            }
          }
        }

        if (!canAccess) {
          await send({ type: "error", text: "Forbidden" });
          await writer.close();
          return;
        }

        linkedAssessmentId = item.assessment_id;
        linkedGapKey = item.gap_key
          ?? gapKeyFromTitle(item.gap_title, item.gap_severity);

        const { error } = await supabase
          .from("remediation_items")
          .update({
            messages: updatedMessages,
            ...(item.gap_key ? {} : { gap_key: linkedGapKey }),
          })
          .eq("id", remediation_id);

        if (error) {
          await send({ type: "error", text: `Could not save chat: ${error.message}` });
          await writer.close();
          return;
        }

        await supabase.from("remediation_activity").insert({
          remediation_id,
          user_id: userId,
          action:  "note_added",
          detail:  `Gap chat: ${new_user_message.trim().slice(0, 120)}`,
        });
      } else if (linkedAssessmentId && linkedGapKey) {
        await syncGapChatToAssessment(linkedAssessmentId, linkedGapKey, updatedMessages, userId);
      }

      // Always mirror remediation chat on the parent assessment when linked
      if (remediation_id && linkedAssessmentId && linkedGapKey) {
        await syncGapChatToAssessment(linkedAssessmentId, linkedGapKey, updatedMessages, userId);
      }

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
