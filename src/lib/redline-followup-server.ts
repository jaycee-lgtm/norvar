import { createClient } from "@supabase/supabase-js";
import {
  parseRedlineThreadKey,
  type RedlineFollowUpMessage,
  type RedlineFollowUps,
} from "@/lib/redline-followup";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function syncRedlineFollowUp(
  redlineId: string,
  thread: string,
  messages: RedlineFollowUpMessage[],
  userId: string,
) {
  const { data: row } = await supabase
    .from("redlines")
    .select("followups, user_id")
    .eq("id", redlineId)
    .eq("user_id", userId)
    .single();

  if (!row) return;

  const current = (row.followups && typeof row.followups === "object")
    ? row.followups as RedlineFollowUps
    : {};

  const parsed = parseRedlineThreadKey(thread);
  const next: RedlineFollowUps = { ...current };

  if (parsed.kind === "general") {
    next.general = messages;
  } else {
    const key = String(parsed.index ?? 0);
    next.clauses = { ...(current.clauses ?? {}), [key]: messages };
  }

  await supabase
    .from("redlines")
    .update({ followups: next })
    .eq("id", redlineId)
    .eq("user_id", userId);
}
