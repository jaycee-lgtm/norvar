import type { DraftClause, DraftSection } from "@/lib/draft";
import { extractRewriteFromAssistant } from "@/lib/redline-inline";
import {
  draftSectionThreadKey,
  getDraftThreadMessages,
  type DraftFollowUps,
} from "@/lib/draft-followup";

export type ClauseRevision = {
  originalText: string;
  proposedText: string;
};

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function followupRevisionForSection(
  followups: DraftFollowUps | undefined,
  sectionNumber: string,
): string | null {
  const thread = draftSectionThreadKey(sectionNumber);
  const messages = getDraftThreadMessages(followups, thread);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== "assistant") continue;
    const rewrite = extractRewriteFromAssistant(messages[i].content);
    if (rewrite) return rewrite;
  }
  return null;
}

/** Parse numbered clause blocks from a **Revised language:** block. */
export function parseRevisedClauses(revisedText: string): Map<string, { title: string; text: string }> {
  const map = new Map<string, { title: string; text: string }>();
  const trimmed = revisedText.trim();
  if (!trimmed) return map;

  const clausePattern = /^(\d+(?:\.\d+)*)\s+([^\n]+)\n([\s\S]*?)(?=^\d+(?:\.\d+)*\s+[^\n]+\n|\s*$)/gm;
  let match: RegExpExecArray | null;
  while ((match = clausePattern.exec(trimmed)) !== null) {
    const text = match[3].trim();
    if (text) map.set(match[1], { title: match[2].trim(), text });
  }

  if (map.size === 0) {
    const single = /^(\d+(?:\.\d+)*)\s+([^\n]+)\n([\s\S]+)$/m.exec(trimmed);
    if (single?.[3]?.trim()) {
      map.set(single[1], { title: single[2].trim(), text: single[3].trim() });
    }
  }

  return map;
}

function revisionForParsedClause(
  clause: DraftClause,
  parsed: Map<string, { title: string; text: string }>,
): ClauseRevision | null {
  const entry = parsed.get(clause.number);
  if (!entry) return null;

  const proposedText = entry.text.trim();
  const originalText = clause.text.trim();
  if (!proposedText || proposedText === originalText) return null;

  return { originalText: clause.text, proposedText };
}

function revisionFromUnnumberedBlock(
  clause: DraftClause,
  section: DraftSection,
  revisedBlock: string,
  messages: ReturnType<typeof getDraftThreadMessages>,
): ClauseRevision | null {
  const proposedText = revisedBlock.trim();
  const originalText = clause.text.trim();
  if (!proposedText || proposedText === originalText) return null;

  if (section.clauses.length === 1) {
    return { originalText: clause.text, proposedText };
  }

  const lastUser = [...messages].reverse().find(m => m.role === "user")?.content.toLowerCase() ?? "";
  const numLower = clause.number.toLowerCase();
  const titleLower = clause.title.toLowerCase();
  if (lastUser.includes(numLower) || (titleLower.length > 3 && lastUser.includes(titleLower))) {
    return { originalText: clause.text, proposedText };
  }

  const normalizedOriginal = normalizeSpace(originalText);
  if (normalizedOriginal.length >= 20 && proposedText.includes(clause.number)) {
    return { originalText: clause.text, proposedText };
  }

  return null;
}

export function getClauseRevision(
  clause: DraftClause,
  section: DraftSection,
  followups?: DraftFollowUps,
): ClauseRevision | null {
  const revisedBlock = followupRevisionForSection(followups, section.number);
  if (!revisedBlock) return null;

  const parsed = parseRevisedClauses(revisedBlock);
  const fromParsed = revisionForParsedClause(clause, parsed);
  if (fromParsed) return fromParsed;

  if (parsed.size > 0) return null;

  const thread = draftSectionThreadKey(section.number);
  const messages = getDraftThreadMessages(followups, thread);
  return revisionFromUnnumberedBlock(clause, section, revisedBlock, messages);
}

export function getSectionClauseRevisions(
  section: DraftSection,
  followups?: DraftFollowUps,
): Map<string, ClauseRevision> {
  const revisions = new Map<string, ClauseRevision>();
  for (const clause of section.clauses) {
    const revision = getClauseRevision(clause, section, followups);
    if (revision) revisions.set(clause.number, revision);
  }
  return revisions;
}
