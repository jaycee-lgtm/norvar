"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import type { RedlineOutput } from "@/lib/redline";
import RedlineFollowUp from "@/components/RedlineFollowUp";
import {
  buildDocumentParts,
  countDecisions,
  followupRewriteForClause,
  type ChangeDecision,
  type ChangeDecisions,
  type MatchedChange,
} from "@/lib/redline-inline";
import {
  getThreadMessages,
  redlineClauseThreadKey,
  type RedlineFollowUpMessage,
  type RedlineFollowUps,
} from "@/lib/redline-followup";

const REWRITE_REQUEST =
  "Please rewrite the suggested language for this clause. Keep it commercially reasonable while fully addressing the compliance issue you flagged. Provide the full replacement text under a **Suggested language:** heading.";

function InlineChangeBlock({
  change,
  decision,
  onDecision,
  redlineId,
  agent,
  followups,
  onClauseFollowUpChange,
}: {
  change:   MatchedChange;
  decision: ChangeDecision;
  onDecision: (key: string, value: ChangeDecision) => void;
  redlineId?: string;
  agent:      "nora" | "cassius";
  followups?: RedlineFollowUps;
  onClauseFollowUpChange?: (index: number, messages: RedlineFollowUpMessage[]) => void;
}) {
  const { clause } = change;
  const thread = redlineClauseThreadKey(change.clauseIndex);
  const baseSuggested = clause.suggested_text?.trim() ?? "";
  const chatRewrite = followupRewriteForClause(followups, change.clauseIndex);
  const showingRewrite = !!(chatRewrite && change.suggestedText.trim() === chatRewrite.trim());

  return (
    <div
      id={`redline-change-${change.key}`}
      className={`redline-inline-change redline-inline-change--${decision}${change.matched ? "" : " redline-inline-change--unmatched"}`}
    >
      <div className="redline-inline-change-head">
        <div className="redline-inline-change-labels">
          <span>{clause.clause_number}</span>
          <span>{clause.clause_title}</span>
          {showingRewrite && (
            <span className="redline-inline-change-rewrite-badge">Updated from chat</span>
          )}
          {!change.matched && <span className="redline-inline-change-flag">Could not locate in text</span>}
        </div>
        <div className="redline-inline-change-actions">
          <button
            type="button"
            className={`redline-inline-decision${decision === "accepted" ? " active" : ""}`}
            onClick={() => onDecision(change.key, decision === "accepted" ? "pending" : "accepted")}
          >
            <Check size={11} /> Accept
          </button>
          <button
            type="button"
            className={`redline-inline-decision redline-inline-decision--decline${decision === "declined" ? " active" : ""}`}
            onClick={() => onDecision(change.key, decision === "declined" ? "pending" : "declined")}
          >
            <X size={11} /> Decline
          </button>
        </div>
      </div>

      {clause.issue && (
        <p className="redline-inline-issue">{clause.issue}</p>
      )}

      {decision !== "accepted" && change.originalText && (
        <p className="redline-inline-del">{change.originalText}</p>
      )}

      {decision !== "declined" && change.suggestedText && (
        <div className="redline-inline-ins-wrap">
          {showingRewrite && baseSuggested && baseSuggested !== change.suggestedText.trim() && (
            <p className="redline-inline-del redline-inline-del--compact">{baseSuggested}</p>
          )}
          <p className="redline-inline-ins">{change.suggestedText}</p>
        </div>
      )}

      {decision === "accepted" && !change.suggestedText && (
        <p className="redline-inline-note">Change accepted.</p>
      )}

      {redlineId && (
        <RedlineFollowUp
          key={`${redlineId}-${thread}`}
          redlineId={redlineId}
          thread={thread}
          clauseIndex={change.clauseIndex}
          agent={agent}
          initialMessages={getThreadMessages(followups, thread)}
          onMessagesChange={msgs => onClauseFollowUpChange?.(change.clauseIndex, msgs)}
          toggleLabel="Ask about this change"
          hint="Ask why this was flagged, whether the suggested language is enough, or request a rewrite tailored to your negotiation position."
          placeholder="Ask about this section..."
          quickActions={[
            {
              label:    "Request rewrite",
              message:  REWRITE_REQUEST,
              autoSend: true,
            },
          ]}
        />
      )}
    </div>
  );
}

export default function RedlineDocumentView({
  sourceText,
  redline,
  decisions,
  onDecisionsChange,
  followups,
  redlineId,
  agent,
  onClauseFollowUpChange,
}: {
  sourceText:              string;
  redline:                 RedlineOutput;
  decisions:               ChangeDecisions;
  onDecisionsChange:       (next: ChangeDecisions) => void;
  followups?:              RedlineFollowUps;
  redlineId?:              string;
  agent:                   "nora" | "cassius";
  onClauseFollowUpChange?: (index: number, messages: RedlineFollowUpMessage[]) => void;
}) {
  const { parts, unmatched } = useMemo(
    () => buildDocumentParts(sourceText, redline, decisions, { followups, includeRewrites: true }),
    [sourceText, redline, decisions, followups],
  );

  const stats = countDecisions(decisions);

  const setDecision = (key: string, value: ChangeDecision) => {
    onDecisionsChange({ ...decisions, [key]: value });
  };

  const setAll = (value: ChangeDecision) => {
    const next: ChangeDecisions = { ...decisions };
    (redline.clauses ?? []).forEach((_, index) => {
      next[`clause:${index}`] = value;
    });
    onDecisionsChange(next);
  };

  const blockProps = {
    redlineId,
    agent,
    followups,
    onClauseFollowUpChange,
  };

  return (
    <div className="redline-document">
      <div className="redline-document-toolbar">
        <div className="redline-document-toolbar-meta">
          <span className="redline-document-title">Contract with inline redlines</span>
          <span>{stats.accepted} accepted · {stats.declined} declined · {stats.pending} pending</span>
        </div>
        <div className="redline-document-toolbar-actions">
          <button type="button" className="redline-doc-toolbar-btn" onClick={() => setAll("accepted")}>
            Accept all
          </button>
          <button type="button" className="redline-doc-toolbar-btn" onClick={() => setAll("declined")}>
            Decline all
          </button>
          <button type="button" className="redline-doc-toolbar-btn" onClick={() => setAll("pending")}>
            Reset
          </button>
        </div>
      </div>

      <div className="redline-document-page">
        {parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text.trim()) return null;
            return (
              <pre key={`text-${i}`} className="redline-document-text">
                {part.text}
              </pre>
            );
          }
          return (
            <InlineChangeBlock
              key={part.change.key}
              change={part.change}
              decision={part.decision}
              onDecision={setDecision}
              {...blockProps}
            />
          );
        })}

        {unmatched.length > 0 && (
          <div className="redline-document-appendix">
            <div className="redline-document-appendix-head">Proposed additions</div>
            {unmatched.map(change => (
              <InlineChangeBlock
                key={`unmatched-${change.key}`}
                change={change}
                decision={decisions[change.key] ?? "pending"}
                onDecision={setDecision}
                {...blockProps}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
