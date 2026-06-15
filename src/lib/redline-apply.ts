import type { RedlineClause, RedlineOutput } from "@/lib/redline";
import {
  applyDocumentDecisions,
  extractRewriteFromAssistant,
  type ChangeDecisions,
} from "@/lib/redline-inline";
import {
  getThreadMessages,
  redlineClauseThreadKey,
  type RedlineFollowUps,
} from "@/lib/redline-followup";

export type AppliedMeta = {
  applied_at:             string;
  include_rewrites:       boolean;
  clauses_applied:        number;
  clauses_skipped:        number;
  missing_added:          number;
  followup_rewrites_used: number;
  skipped_clauses:        string[];
  decisions_used?:        boolean;
};

export type ApplyResult = {
  text: string;
  meta: AppliedMeta;
};

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function followupRewriteForClause(followups: RedlineFollowUps | undefined, index: number): string | null {
  const messages = getThreadMessages(followups, redlineClauseThreadKey(index));
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== "assistant") continue;
    const rewrite = extractRewriteFromAssistant(messages[i].content);
    if (rewrite) return rewrite;
  }
  return null;
}

function replaceOnce(text: string, search: string, replacement: string): { text: string; applied: boolean } {
  const idx = text.indexOf(search);
  if (idx >= 0) {
    return {
      text: text.slice(0, idx) + replacement + text.slice(idx + search.length),
      applied: true,
    };
  }

  const normalizedSearch = normalizeSpace(search);
  if (normalizedSearch.length < 20) return { text, applied: false };

  const lowerText = text.toLowerCase();
  const lowerSearch = normalizedSearch.toLowerCase();
  const fuzzyIdx = lowerText.indexOf(lowerSearch);
  if (fuzzyIdx >= 0) {
    return {
      text: text.slice(0, fuzzyIdx) + replacement + text.slice(fuzzyIdx + normalizedSearch.length),
      applied: true,
    };
  }

  return { text, applied: false };
}

function applyClauseEdit(
  text: string,
  clause: RedlineClause,
  suggested: string,
): { text: string; applied: boolean; kind: "replace" | "append" | "skip" } {
  const replacement = suggested.trim();
  if (!replacement) return { text, applied: false, kind: "skip" };

  if (clause.status === "missing") {
    const block = `\n\n---\n[ADDED — ${clause.clause_title || clause.clause_number}]\n${replacement}\n`;
    return { text: text + block, applied: true, kind: "append" };
  }

  if (clause.original_text?.trim()) {
    const direct = replaceOnce(text, clause.original_text.trim(), replacement);
    if (direct.applied) return { ...direct, kind: "replace" };
  }

  if (clause.clause_number) {
    const anchor = new RegExp(
      `(${escapeRegex(clause.clause_number)}[\\s\\S]{0,2500}?)(?=\\n\\s*(?:Section|Article|Schedule|\\d+(?:\\.\\d+)+\\s|$))`,
      "i",
    );
    const match = anchor.exec(text);
    if (match?.[1]) {
      return {
        text: text.replace(match[1], replacement),
        applied: true,
        kind: "replace",
      };
    }
  }

  return { text, applied: false, kind: "skip" };
}

export function applyRedlineChanges(
  sourceText: string,
  redline: RedlineOutput,
  options: {
    includeRewrites?: boolean;
    followups?: RedlineFollowUps;
    decisions?: ChangeDecisions;
  } = {},
): ApplyResult {
  const includeRewrites = options.includeRewrites ?? false;
  const followups = options.followups;
  const decisions = options.decisions;

  if (decisions && Object.keys(decisions).length > 0) {
    const text = applyDocumentDecisions(sourceText, redline, decisions, {
      includeRewrites,
      followups,
    });
    const counts = Object.values(decisions).reduce(
      (acc, value) => {
        if (value === "accepted") acc.accepted += 1;
        else if (value === "declined") acc.declined += 1;
        else acc.pending += 1;
        return acc;
      },
      { accepted: 0, declined: 0, pending: 0 },
    );
    return {
      text,
      meta: {
        applied_at: new Date().toISOString(),
        include_rewrites: includeRewrites,
        clauses_applied: counts.accepted,
        clauses_skipped: counts.declined,
        missing_added: 0,
        followup_rewrites_used: 0,
        skipped_clauses: [],
        decisions_used: true,
      },
    };
  }

  let text = sourceText;

  let clausesApplied = 0;
  let clausesSkipped = 0;
  let missingAdded = 0;
  let followupRewritesUsed = 0;
  const skippedClauses: string[] = [];

  const clauses = [...(redline.clauses ?? [])];
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    let suggested = clause.suggested_text?.trim() ?? "";

    if (includeRewrites) {
      const followupRewrite = followupRewriteForClause(followups, index);
      if (followupRewrite) {
        suggested = followupRewrite;
        followupRewritesUsed += 1;
      }
    }

    if (!suggested) {
      clausesSkipped += 1;
      skippedClauses.push(clause.clause_title || clause.clause_number || `Clause ${index + 1}`);
      continue;
    }

    const result = applyClauseEdit(text, clause, suggested);
    text = result.text;

    if (result.applied) {
      clausesApplied += 1;
      if (result.kind === "append") missingAdded += 1;
    } else {
      clausesSkipped += 1;
      skippedClauses.push(clause.clause_title || clause.clause_number || `Clause ${index + 1}`);
    }
  }

  if (includeRewrites && redline.missing_clauses?.length) {
    const generalMessages = followups?.general ?? [];
    for (let i = generalMessages.length - 1; i >= 0; i -= 1) {
      if (generalMessages[i].role !== "assistant") continue;
      const rewrite = extractRewriteFromAssistant(generalMessages[i].content);
      if (rewrite) {
        text += `\n\n---\n[ADDED FROM REVIEW DISCUSSION]\n${rewrite}\n`;
        missingAdded += 1;
        break;
      }
    }
  }

  return {
    text,
    meta: {
      applied_at: new Date().toISOString(),
      include_rewrites: includeRewrites,
      clauses_applied: clausesApplied,
      clauses_skipped: clausesSkipped,
      missing_added: missingAdded,
      followup_rewrites_used: followupRewritesUsed,
      skipped_clauses: skippedClauses,
    },
  };
}

export function buildExportFilename(agreementType: string, ext: "docx" | "pdf") {
  const slug = agreementType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "contract";
  return `${slug}-redlined.${ext}`;
}
