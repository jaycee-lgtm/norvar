import { createClient } from "@supabase/supabase-js";
import type { RedlineClause, RedlineOutput } from "@/lib/redline";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";
import { GRC_FORMATTING_RULES, GRC_PLAIN_LANGUAGE_RULES } from "@/lib/grc-prompt";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type RedlineFollowUpMessage = {
  role: "user" | "assistant";
  content: string;
  id?: string;
  feedback?: "up" | "down" | null;
};

export type RedlineFollowUps = {
  general?: RedlineFollowUpMessage[];
  clauses?: Record<string, RedlineFollowUpMessage[]>;
};

export function redlineClauseThreadKey(index: number) {
  return `clause:${index}`;
}

export function parseRedlineThreadKey(thread: string): { kind: "general" | "clause"; index?: number } {
  if (thread === "general") return { kind: "general" };
  const m = /^clause:(\d+)$/.exec(thread);
  if (m) return { kind: "clause", index: parseInt(m[1], 10) };
  return { kind: "general" };
}

function buildClauseContext(clause: RedlineClause) {
  return [
    `Clause: ${clause.clause_number} — ${clause.clause_title}`,
    `Status: ${clause.status} · Severity: ${clause.severity} · Domain: ${clause.domain}`,
    clause.original_text ? `Current language: ${clause.original_text}` : null,
    `Issue: ${clause.issue}`,
    clause.suggested_text ? `Suggested language: ${clause.suggested_text}` : null,
    clause.frameworks?.length ? `Frameworks: ${clause.frameworks.join(", ")}` : null,
  ].filter(Boolean).join("\n");
}

function buildReviewSummary(redline: RedlineOutput) {
  const topIssues = redline.clauses.slice(0, 5).map(c =>
    `${c.clause_number} ${c.clause_title} (${c.severity})`,
  );
  return [
    `Agreement: ${redline.agreement_type}`,
    redline.governing_law ? `Governing law: ${redline.governing_law}` : null,
    redline.parties?.length ? `Parties: ${redline.parties.join(" — ")}` : null,
    `Overall status: ${redline.overall_status}`,
    `Summary: ${redline.summary}`,
    redline.missing_clauses?.length ? `Missing clauses: ${redline.missing_clauses.join("; ")}` : null,
    topIssues.length ? `Top flagged clauses: ${topIssues.join("; ")}` : null,
    redline.frameworks?.length ? `Applicable frameworks: ${redline.frameworks.join(", ")}` : null,
  ].filter(Boolean).join("\n");
}

export function buildRedlineFollowUpSystemPrompt(
  agent: "nora" | "cassius",
  redline: RedlineOutput,
  thread: string,
  clause?: RedlineClause,
) {
  const agentName = agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name;
  const parsed = parseRedlineThreadKey(thread);
  const scope = parsed.kind === "clause" && clause
    ? `one specific flagged clause from the review.\n\nCLAUSE CONTEXT:\n${buildClauseContext(clause)}`
    : `their contract redline review as a whole.\n\nREVIEW CONTEXT:\n${buildReviewSummary(redline)}`;

  return `You are ${agentName}, Norvar's ${agent === "nora" ? "compliance chat assistant" : "regulatory assessment agent"}. The user completed a contract redline review and is asking a follow-up question about ${scope}

Rules:
- Answer only what was asked. Be direct and concise.
- Do not repeat or re-summarise the entire review unless the user asks for a recap.
- Build on prior messages in this thread.
- Explain regulatory requirements in plain language first; cite specific frameworks when helpful.
${GRC_PLAIN_LANGUAGE_RULES}
${GRC_FORMATTING_RULES}
- Stay focused on this contract review — do not drift into unrelated GRC topics.
- If the question is already answered in the thread, say so briefly and add anything new.`;
}

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

export function getThreadMessages(followups: RedlineFollowUps | undefined, thread: string): RedlineFollowUpMessage[] {
  if (!followups) return [];
  const parsed = parseRedlineThreadKey(thread);
  if (parsed.kind === "general") return followups.general ?? [];
  return followups.clauses?.[String(parsed.index ?? 0)] ?? [];
}
