import type { DraftOutput, DraftSection } from "@/lib/draft";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";
import { GRC_FORMATTING_RULES, GRC_PLAIN_LANGUAGE_RULES } from "@/lib/grc-prompt";

export type DraftFollowUpMessage = {
  role: "user" | "assistant";
  content: string;
  id?: string;
  feedback?: "up" | "down" | null;
};

export type DraftFollowUps = {
  general?:  DraftFollowUpMessage[];
  sections?: Record<string, DraftFollowUpMessage[]>;
};

export function draftSectionThreadKey(sectionNumber: string) {
  return `section:${sectionNumber}`;
}

export function parseDraftThreadKey(thread: string): { kind: "general" | "section"; sectionNumber?: string } {
  if (thread === "general") return { kind: "general" };
  const match = /^section:(.+)$/.exec(thread);
  if (match) return { kind: "section", sectionNumber: match[1] };
  return { kind: "general" };
}

function buildSectionContext(section: DraftSection) {
  const clauses = (section.clauses ?? []).map(c =>
    `${c.number} ${c.title}\n${c.text}`,
  ).join("\n\n");
  return [
    `Section ${section.number}: ${section.title}`,
    clauses ? `Clauses:\n${clauses}` : null,
  ].filter(Boolean).join("\n\n");
}

function buildDraftSummary(draft: DraftOutput) {
  const sectionList = (draft.sections ?? []).map(s =>
    `${s.number}. ${s.title} (${s.clauses?.length ?? 0} clauses)`,
  );
  return [
    draft.document_name || draft.title ? `Document: ${draft.document_name || draft.title}` : null,
    `Agreement type: ${draft.agreement_type}`,
    draft.parties ? `Parties: ${draft.parties.provider} — ${draft.parties.customer}` : null,
    draft.governing_law ? `Governing law: ${draft.governing_law}` : null,
    `Summary: ${draft.summary}`,
    sectionList.length ? `Sections:\n${sectionList.join("\n")}` : null,
    draft.frameworks?.length ? `Frameworks: ${draft.frameworks.join(", ")}` : null,
    draft.drafting_notes?.length ? `Drafting notes: ${draft.drafting_notes.join("; ")}` : null,
  ].filter(Boolean).join("\n");
}

export function buildDraftFollowUpSystemPrompt(
  agent: "nora" | "cassius",
  draft: DraftOutput,
  thread: string,
  section?: DraftSection,
) {
  const agentName = agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name;
  const parsed = parseDraftThreadKey(thread);
  const scope = parsed.kind === "section" && section
    ? `one section of a drafted agreement.\n\nSECTION CONTEXT:\n${buildSectionContext(section)}`
    : `their drafted agreement as a whole.\n\nDRAFT CONTEXT:\n${buildDraftSummary(draft)}`;

  return `You are ${agentName}, Norvar's ${agent === "nora" ? "compliance chat assistant" : "regulatory assessment agent"}. The user completed an agreement draft with Perta and is asking a follow-up about ${scope}

Rules:
- Answer only what was asked. Be direct and concise.
- Do not repeat the entire draft unless the user asks for a recap.
- Build on prior messages in this thread.
- Explain regulatory requirements in plain language; cite frameworks when helpful.
${GRC_PLAIN_LANGUAGE_RULES}
- If the user asks for changes, revisions, or alternative language, provide the full updated section or clause text under a heading **Revised language:** followed by ready-to-paste text.
- If they ask to update a single clause, still use **Revised language:** with the complete revised clause.
${GRC_FORMATTING_RULES}
- Stay focused on this draft — do not drift into unrelated topics.
- If already answered in the thread, say so briefly and add anything new.`;
}

export function getDraftThreadMessages(followups: DraftFollowUps | undefined, thread: string): DraftFollowUpMessage[] {
  if (!followups) return [];
  const parsed = parseDraftThreadKey(thread);
  if (parsed.kind === "general") return followups.general ?? [];
  return followups.sections?.[parsed.sectionNumber ?? ""] ?? [];
}

export function hasDraftFollowupThreads(followups: DraftFollowUps | undefined): boolean {
  if (!followups) return false;
  const general = followups.general?.some(m => m.role === "user");
  const sections = followups.sections && Object.values(followups.sections).some(msgs => msgs.some(m => m.role === "user"));
  return !!(general || sections);
}
