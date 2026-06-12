import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type GapChatMessage = { role: "user" | "assistant"; content: string };

export async function syncGapChatToAssessment(
  assessmentId: string,
  gapKey:       string,
  messages:     GapChatMessage[],
  userId:       string,
) {
  const { data: row } = await supabase
    .from("assessments")
    .select("gap_chats, user_id")
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .single();

  if (!row) return;

  const gapChats = (row.gap_chats && typeof row.gap_chats === "object")
    ? row.gap_chats as Record<string, GapChatMessage[]>
    : {};

  await supabase
    .from("assessments")
    .update({ gap_chats: { ...gapChats, [gapKey]: messages } })
    .eq("id", assessmentId)
    .eq("user_id", userId);
}

export function gapKeyFromTitle(title: string, severity: string) {
  return `${severity}:${title}`.slice(0, 200);
}
