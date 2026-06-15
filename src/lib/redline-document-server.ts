import { createClient } from "@supabase/supabase-js";
import { fetchDocumentText } from "@/lib/documents";
import { applyRedlineChanges, type AppliedMeta } from "@/lib/redline-apply";
import type { ChangeDecisions } from "@/lib/redline-inline";
import type { RedlineOutput } from "@/lib/redline";
import { stripDocumentBlock } from "@/lib/redline";
import type { RedlineFollowUps } from "@/lib/redline-followup";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type RedlineRow = {
  id:             string;
  user_id:        string;
  agent:          string;
  agreement_type: string | null;
  document_id:    string | null;
  result:         RedlineOutput;
  followups:      RedlineFollowUps | null;
  source_text:    string | null;
  applied_text:   string | null;
  applied_meta:   AppliedMeta | null;
  change_decisions?: ChangeDecisions | null;
};

export async function loadRedlineRow(redlineId: string, userId: string): Promise<RedlineRow | null> {
  const fullSelect =
    "id, user_id, agent, agreement_type, document_id, result, followups, source_text, applied_text, applied_meta, change_decisions";
  const baseSelect = "id, user_id, agent, agreement_type, document_id, result, followups";

  let { data, error } = await supabase
    .from("redlines")
    .select(fullSelect)
    .eq("id", redlineId)
    .eq("user_id", userId)
    .single();

  if (error?.message.includes("source_text") || error?.message.includes("applied_text")) {
    ({ data, error } = await supabase
      .from("redlines")
      .select(baseSelect)
      .eq("id", redlineId)
      .eq("user_id", userId)
      .single());
  }

  if (error || !data) return null;
  return data as RedlineRow;
}

export async function resolveRedlineSourceText(row: RedlineRow, userId: string): Promise<string | null> {
  if (row.source_text?.trim()) return row.source_text.trim();

  if (row.document_id) {
    const text = stripDocumentBlock(await fetchDocumentText(row.document_id, userId));
    if (text.length >= 100) return text;
  }

  return null;
}

export async function applyAndSaveRedline(
  row: RedlineRow,
  userId: string,
  includeRewrites: boolean,
  decisions?: ChangeDecisions,
) {
  const sourceText = await resolveRedlineSourceText(row, userId);
  if (!sourceText) {
    throw new Error("Original contract text is unavailable for this review.");
  }

  const followups = (row.followups && typeof row.followups === "object")
    ? row.followups
    : {};

  const activeDecisions = decisions ?? row.change_decisions ?? undefined;

  const { text, meta } = applyRedlineChanges(sourceText, row.result, {
    includeRewrites,
    followups,
    decisions: activeDecisions ?? undefined,
  });

  const payload = {
    applied_text: text,
    applied_meta: meta,
    ...(decisions ? { change_decisions: decisions } : {}),
    ...(row.source_text ? {} : { source_text: sourceText.slice(0, 120000) }),
  };

  let { error } = await supabase
    .from("redlines")
    .update(payload)
    .eq("id", row.id)
    .eq("user_id", userId);

  if (error?.message.includes("applied_text") || error?.message.includes("source_text")) {
    throw new Error("Database migration required: add source_text and applied_text columns to redlines.");
  }
  if (error) throw new Error(error.message);

  return { text, meta };
}

export async function getAppliedOrFreshText(
  row: RedlineRow,
  userId: string,
  includeRewrites: boolean,
  decisions?: ChangeDecisions,
) {
  if (
    row.applied_text?.trim()
    && row.applied_meta?.include_rewrites === includeRewrites
    && !decisions
  ) {
    return { text: row.applied_text, meta: row.applied_meta };
  }
  return applyAndSaveRedline(row, userId, includeRewrites, decisions);
}
