import { createClient } from "@supabase/supabase-js";
import {
  parseDraftThreadKey,
  type DraftFollowUpMessage,
  type DraftFollowUps,
} from "@/lib/draft-followup";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function syncDraftFollowUp(
  draftId: string,
  thread: string,
  messages: DraftFollowUpMessage[],
  userId: string,
) {
  const { data: row, error } = await supabase
    .from("drafted_agreements")
    .select("followups, user_id")
    .eq("id", draftId)
    .eq("user_id", userId)
    .single();

  if (error?.message?.includes("followups")) return;
  if (error || !row) return;

  const current = (row.followups && typeof row.followups === "object")
    ? row.followups as DraftFollowUps
    : {};

  const parsed = parseDraftThreadKey(thread);
  const next: DraftFollowUps = { ...current };

  if (parsed.kind === "general") {
    next.general = messages;
  } else if (parsed.sectionNumber) {
    next.sections = { ...(current.sections ?? {}), [parsed.sectionNumber]: messages };
  }

  await supabase
    .from("drafted_agreements")
    .update({ followups: next })
    .eq("id", draftId)
    .eq("user_id", userId);
}
