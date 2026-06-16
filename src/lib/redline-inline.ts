import type { RedlineClause, RedlineOutput } from "@/lib/redline";
import {
  getThreadMessages,
  redlineClauseThreadKey,
  type RedlineFollowUpMessage,
  type RedlineFollowUps,
} from "@/lib/redline-followup";

export type ChangeDecision = "pending" | "accepted" | "declined";
export type ChangeDecisions = Record<string, ChangeDecision>;

export type MatchedChange = {
  key:            string;
  kind:           "replace" | "insert";
  start:          number;
  end:            number;
  originalText:   string;
  suggestedText:  string;
  clauseIndex:    number;
  clause:         RedlineClause;
  matched:        boolean;
};

export type DocumentPart =
  | { type: "text"; text: string }
  | { type: "change"; change: MatchedChange; decision: ChangeDecision };

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function changeKey(index: number) {
  return `clause:${index}`;
}

export function extractRewriteFromAssistant(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const codeBlocks = [...trimmed.matchAll(/```(?:[\w-]*\n)?([\s\S]*?)```/g)]
    .map(m => m[1].trim())
    .filter(block => block.length >= 40);
  if (codeBlocks.length) return codeBlocks[codeBlocks.length - 1];

  const normalized = trimmed.replace(/\*\*/g, "");
  const labeled = normalized.match(
    /(?:Suggested language|Revised language|Replace with|Revised clause|Updated language|Use this instead)\s*:?\s*\n+([\s\S]+?)(?:\n\n|$)/i,
  );
  if (labeled?.[1]?.trim() && labeled[1].trim().length >= 15) return labeled[1].trim();

  const inlineLabeled = normalized.match(
    /(?:Suggested language|Revised language|Replace with|Revised clause|Updated language|Use this instead)\s*:\s*([\s\S]{15,})/i,
  );
  if (inlineLabeled?.[1]?.trim()) return inlineLabeled[1].trim();

  const quoted = trimmed.match(/[""]([^""]{40,})[""]/);
  if (quoted?.[1]) return quoted[1].trim();

  return null;
}

export function followupRewriteForClause(followups: RedlineFollowUps | undefined, index: number): string | null {
  const messages = getThreadMessages(followups, redlineClauseThreadKey(index));
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== "assistant") continue;
    const rewrite = extractRewriteFromAssistant(messages[i].content);
    if (rewrite) return rewrite;
  }
  return null;
}

export type ClauseInlineProposal = {
  originalText:    string;
  baseSuggested:   string;
  proposedText:    string;
  showingRewrite:  boolean;
};

export function getClauseInlineProposal(
  clause: RedlineClause,
  index: number,
  followups?: RedlineFollowUps,
): ClauseInlineProposal | null {
  const baseSuggested = clause.suggested_text?.trim() ?? "";
  const chatRewrite   = followupRewriteForClause(followups, index);
  const proposedText  = (chatRewrite || baseSuggested).trim();
  const originalText  = clause.original_text?.trim() ?? "";

  if (!proposedText && !originalText) return null;

  return {
    originalText,
    baseSuggested,
    proposedText,
    showingRewrite: !!(chatRewrite && chatRewrite.trim() !== baseSuggested),
  };
}

export function suggestedTextForClause(
  clause: RedlineClause,
  index: number,
  followups?: RedlineFollowUps,
  includeRewrites?: boolean,
): string {
  if (includeRewrites) {
    const rewrite = followupRewriteForClause(followups, index);
    if (rewrite) return rewrite;
  }
  return clause.suggested_text?.trim() ?? "";
}

export function findClauseMatch(sourceText: string, clause: RedlineClause, index: number): MatchedChange | null {
  const suggested = clause.suggested_text?.trim() ?? "";
  if (!suggested && clause.status !== "missing") return null;

  if (clause.status === "missing") {
    return {
      key: changeKey(index),
      kind: "insert",
      start: sourceText.length,
      end: sourceText.length,
      originalText: "",
      suggestedText: suggested,
      clauseIndex: index,
      clause,
      matched: true,
    };
  }

  const original = clause.original_text?.trim() ?? "";
  if (original.length >= 12) {
    const idx = sourceText.indexOf(original);
    if (idx >= 0) {
      return {
        key: changeKey(index),
        kind: "replace",
        start: idx,
        end: idx + original.length,
        originalText: sourceText.slice(idx, idx + original.length),
        suggestedText: suggested,
        clauseIndex: index,
        clause,
        matched: true,
      };
    }

    const normalized = normalizeSpace(original);
    if (normalized.length >= 20) {
      const lower = sourceText.toLowerCase();
      const fuzzyIdx = lower.indexOf(normalized.toLowerCase());
      if (fuzzyIdx >= 0) {
        return {
          key: changeKey(index),
          kind: "replace",
          start: fuzzyIdx,
          end: fuzzyIdx + normalized.length,
          originalText: sourceText.slice(fuzzyIdx, fuzzyIdx + normalized.length),
          suggestedText: suggested,
          clauseIndex: index,
          clause,
          matched: true,
        };
      }
    }
  }

  if (clause.clause_number) {
    const anchor = new RegExp(
      escapeRegex(clause.clause_number) + "[\\s\\S]{0,2500}?(?=\\n\\s*(?:Section|Article|Schedule|\\d+(?:\\.\\d+)+\\s|$))",
      "i",
    );
    const match = anchor.exec(sourceText);
    if (match?.[0]) {
      return {
        key: changeKey(index),
        kind: "replace",
        start: match.index,
        end: match.index + match[0].length,
        originalText: match[0],
        suggestedText: suggested,
        clauseIndex: index,
        clause,
        matched: true,
      };
    }
  }

  return {
    key: changeKey(index),
    kind: "replace",
    start: sourceText.length,
    end: sourceText.length,
    originalText: original,
    suggestedText: suggested,
    clauseIndex: index,
    clause,
    matched: false,
  };
}

export function buildDocumentParts(
  sourceText: string,
  redline: RedlineOutput,
  decisions: ChangeDecisions = {},
  options: { includeRewrites?: boolean; followups?: RedlineFollowUps } = {},
): { parts: DocumentPart[]; unmatched: MatchedChange[] } {
  const clauses = redline.clauses ?? [];
  const matches: MatchedChange[] = [];

  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    const suggested = suggestedTextForClause(clause, index, options.followups, options.includeRewrites);
    if (!suggested && clause.status !== "missing") continue;

    const match = findClauseMatch(sourceText, { ...clause, suggested_text: suggested }, index);
    if (match) matches.push(match);
  }

  const inlineMatches = matches
    .filter(m => m.matched && m.kind === "replace")
    .sort((a, b) => a.start - b.start);

  const nonOverlapping: MatchedChange[] = [];
  let cursor = 0;
  for (const match of inlineMatches) {
    if (match.start < cursor) continue;
    nonOverlapping.push(match);
    cursor = match.end;
  }

  const parts: DocumentPart[] = [];
  let pos = 0;
  for (const match of nonOverlapping) {
    if (match.start > pos) {
      parts.push({ type: "text", text: sourceText.slice(pos, match.start) });
    }
    parts.push({
      type: "change",
      change: match,
      decision: decisions[match.key] ?? "pending",
    });
    pos = match.end;
  }

  if (pos < sourceText.length) {
    parts.push({ type: "text", text: sourceText.slice(pos) });
  }

  const unmatched = matches.filter(m => !m.matched || m.kind === "insert");
  return { parts, unmatched };
}

export function defaultDecisions(redline: RedlineOutput): ChangeDecisions {
  const decisions: ChangeDecisions = {};
  (redline.clauses ?? []).forEach((_, index) => {
    decisions[changeKey(index)] = "pending";
  });
  return decisions;
}

export function countDecisions(decisions: ChangeDecisions) {
  const values = Object.values(decisions);
  return {
    pending:  values.filter(v => v === "pending").length,
    accepted: values.filter(v => v === "accepted").length,
    declined: values.filter(v => v === "declined").length,
  };
}

export function applyDocumentDecisions(
  sourceText: string,
  redline: RedlineOutput,
  decisions: ChangeDecisions,
  options: { includeRewrites?: boolean; followups?: RedlineFollowUps } = {},
): string {
  const { parts, unmatched } = buildDocumentParts(sourceText, redline, decisions, options);
  let output = "";

  for (const part of parts) {
    if (part.type === "text") {
      output += part.text;
      continue;
    }
    const { change, decision } = part;
    if (decision === "declined") {
      output += change.originalText;
    } else if (decision === "accepted") {
      output += change.suggestedText;
    } else {
      output += change.originalText;
    }
  }

  for (const change of unmatched) {
    const decision = decisions[change.key] ?? "pending";
    if (decision === "accepted") {
      output += `\n\n[ADDED — ${change.clause.clause_title || change.clause.clause_number}]\n${change.suggestedText}\n`;
    }
  }

  return output;
}
