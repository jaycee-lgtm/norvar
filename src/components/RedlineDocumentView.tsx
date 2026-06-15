"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import type { RedlineOutput } from "@/lib/redline";
import {
  buildDocumentParts,
  countDecisions,
  type ChangeDecision,
  type ChangeDecisions,
  type MatchedChange,
} from "@/lib/redline-inline";
import type { RedlineFollowUps } from "@/lib/redline-followup";

const SEV_LABELS = {
  high:   "High",
  medium: "Medium",
  low:    "Low",
} as const;

function InlineChangeBlock({
  change,
  decision,
  onDecision,
}: {
  change:   MatchedChange;
  decision: ChangeDecision;
  onDecision: (key: string, value: ChangeDecision) => void;
}) {
  const { clause } = change;
  const sev = SEV_LABELS[clause.severity] ?? clause.severity;

  return (
    <div
      id={`redline-change-${change.key}`}
      className={`redline-inline-change redline-inline-change--${decision}${change.matched ? "" : " redline-inline-change--unmatched"}`}
    >
      <div className="redline-inline-change-head">
        <div className="redline-inline-change-labels">
          <span className="redline-inline-change-sev">{sev}</span>
          <span>{clause.clause_number}</span>
          <span>{clause.clause_title}</span>
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
        <p className="redline-inline-ins">{change.suggestedText}</p>
      )}

      {decision === "accepted" && !change.suggestedText && (
        <p className="redline-inline-note">Change accepted.</p>
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
  includeRewrites = false,
}: {
  sourceText:        string;
  redline:           RedlineOutput;
  decisions:         ChangeDecisions;
  onDecisionsChange: (next: ChangeDecisions) => void;
  followups?:        RedlineFollowUps;
  includeRewrites?:  boolean;
}) {
  const { parts, unmatched } = useMemo(
    () => buildDocumentParts(sourceText, redline, decisions, { followups, includeRewrites }),
    [sourceText, redline, decisions, followups, includeRewrites],
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
