import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MessageFeedbackRating = "up" | "down";
export type MessageFeedbackSource = "conversation" | "assessment" | "gap_chat";

export type FeedbackableMessage = {
  id?: string;
  feedback?: MessageFeedbackRating | null;
  role?: string;
  content?: string;
  text?: string;
};

export function newMessageId() {
  return randomUUID();
}

export function assistantText(msg: FeedbackableMessage): string {
  return (msg.content ?? msg.text ?? "").trim();
}

export async function appendLikedFramingExamples(
  supabase: SupabaseClient,
  system: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from("message_feedback")
      .select("user_message, message_content")
      .eq("rating", "up")
      .order("created_at", { ascending: false })
      .limit(2);

    if (!data?.length) return system;

    const block = data
      .map((row, i) => {
        const user = row.user_message?.trim().slice(0, 180) ?? "(prior question)";
        const reply = row.message_content.trim().slice(0, 500);
        return `${i + 1}. User: "${user}"\n   Assistant (rated helpful): "${reply}"`;
      })
      .join("\n");

    return `${system}\n\nUSERS RATED THESE RESPONSE FRAMINGS HIGHLY — mirror this clarity and structure when similar questions arise:\n${block}`;
  } catch {
    return system;
  }
}

function patchMessagesFeedback(
  messages: FeedbackableMessage[],
  messageId: string,
  feedback: MessageFeedbackRating | null,
): FeedbackableMessage[] {
  return messages.map(m => (m.id === messageId ? { ...m, feedback } : m));
}

export async function persistMessageFeedback(
  supabase: SupabaseClient,
  userId: string,
  payload: {
    source: MessageFeedbackSource;
    container_id: string;
    message_id: string;
    rating: MessageFeedbackRating | null;
    message_content: string;
    user_message?: string;
    gap_key?: string;
    agent?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    source,
    container_id,
    message_id,
    rating,
    message_content,
    user_message,
    gap_key,
    agent = "nora",
  } = payload;

  if (rating === null) {
    await supabase
      .from("message_feedback")
      .delete()
      .eq("user_id", userId)
      .eq("message_id", message_id);
  } else {
    const { error: upsertError } = await supabase.from("message_feedback").upsert(
      {
        user_id:         userId,
        source,
        container_id,
        message_id,
        gap_key:         gap_key ?? null,
        agent,
        rating,
        message_content: message_content.slice(0, 12000),
        user_message:    user_message?.slice(0, 2000) ?? null,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "user_id,message_id" },
    );
    if (upsertError) return { ok: false, error: upsertError.message };
  }

  if (source === "conversation") {
    const { data: row } = await supabase
      .from("conversations")
      .select("messages")
      .eq("id", container_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!row) return { ok: false, error: "Conversation not found" };

    const messages = Array.isArray(row.messages) ? (row.messages as FeedbackableMessage[]) : [];
    const updated = patchMessagesFeedback(messages, message_id, rating);
    const { error } = await supabase
      .from("conversations")
      .update({ messages: updated, updated_at: new Date().toISOString() })
      .eq("id", container_id)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (source === "assessment") {
    const { data: row } = await supabase
      .from("assessments")
      .select("messages")
      .eq("id", container_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!row) return { ok: false, error: "Assessment not found" };

    const messages = Array.isArray(row.messages) ? (row.messages as FeedbackableMessage[]) : [];
    const updated = patchMessagesFeedback(messages, message_id, rating);
    const { error } = await supabase
      .from("assessments")
      .update({ messages: updated })
      .eq("id", container_id)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (source === "gap_chat") {
    if (!gap_key) return { ok: false, error: "gap_key required for gap chat feedback" };

    let assessmentId: string | null = null;
    let synced = false;

    const { data: remediation } = await supabase
      .from("remediation_items")
      .select("id, messages, created_by, assigned_to, assessment_id, gap_key")
      .eq("id", container_id)
      .maybeSingle();

    if (remediation) {
      const canAccess =
        remediation.created_by === userId
        || (remediation.assigned_to ?? []).includes(userId);
      if (!canAccess) return { ok: false, error: "Forbidden" };

      const messages = Array.isArray(remediation.messages)
        ? (remediation.messages as FeedbackableMessage[])
        : [];
      const updated = patchMessagesFeedback(messages, message_id, rating);
      const { error } = await supabase
        .from("remediation_items")
        .update({ messages: updated })
        .eq("id", container_id);
      if (error) return { ok: false, error: error.message };

      assessmentId = remediation.assessment_id;
      synced = true;
    } else {
      assessmentId = container_id;
    }

    const { data: assessment } = await supabase
      .from("assessments")
      .select("gap_chats, user_id")
      .eq("id", assessmentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!assessment) {
      return synced ? { ok: true } : { ok: false, error: "Gap chat not found" };
    }

    const gapChats = (assessment.gap_chats && typeof assessment.gap_chats === "object")
      ? (assessment.gap_chats as Record<string, FeedbackableMessage[]>)
      : {};
    const thread = gapChats[gap_key] ?? [];
    gapChats[gap_key] = patchMessagesFeedback(thread, message_id, rating);
    const { error } = await supabase
      .from("assessments")
      .update({ gap_chats: gapChats })
      .eq("id", assessmentId)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  return { ok: false, error: "Invalid source" };
}
