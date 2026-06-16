"use client";

import { useMemo, useState } from "react";
import { Shield, Copy, Check } from "lucide-react";
import type { RedlineClause, RedlineOutput, RedlineStatus } from "@/lib/redline";
import FrameworkRef from "@/components/FrameworkRef";
import RedlineFollowUp from "@/components/RedlineFollowUp";
import RedlineDocumentView from "@/components/RedlineDocumentView";
import {
  getClauseInlineProposal,
  type ChangeDecisions,
} from "@/lib/redline-inline";
import {
  getThreadMessages,
  redlineClauseThreadKey,
  redlinePositiveThreadKey,
  type RedlineFollowUpMessage,
  type RedlineFollowUps,
} from "@/lib/redline-followup";

const STATUS_STYLES: Record<RedlineStatus, { label: string; color: string }> = {
  non_compliant: { label: "Non-compliant", color: "var(--rh, #A32D2D)"  },
  missing:       { label: "Missing",       color: "var(--rh, #A32D2D)"  },
  weak:          { label: "Weak",          color: "var(--rm, #854F0B)"  },
  recommend:     { label: "Recommend",     color: "var(--rl, #3B6D11)"  },
  compliant:     { label: "Compliant",     color: "var(--fg3, #a8998e)" },
};

const DOMAIN_LABELS: Record<string, string> = {
  privacy: "Privacy", ai_governance: "AI Governance", cybersecurity: "Cybersecurity",
};

function parsePositiveClause(text: string) {
  const trimmed = text.trim();
  const match = /^(.+?)\s*\((.+)\)\s*$/.exec(trimmed);
  if (match) return { title: match[1].trim(), detail: match[2].trim() };
  return { title: trimmed, detail: null as string | null };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 4, border: "0.5px solid var(--bdr2)",
        background: "var(--card2)", color: "var(--fg3)", fontSize: 10,
        fontWeight: 500, cursor: "pointer", flexShrink: 0,
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function InlineRedlineClauseLanguage({
  clause,
  index,
  followups,
}: {
  clause:     RedlineClause;
  index:      number;
  followups?: RedlineFollowUps;
}) {
  const proposal = useMemo(
    () => getClauseInlineProposal(clause, index, followups),
    [clause, index, followups],
  );

  if (!proposal?.proposedText && !proposal?.originalText) return null;

  const { originalText, baseSuggested, proposedText, showingRewrite } = proposal;

  if (!originalText && proposedText) {
    return (
      <div className="redline-clause-inline-revision">
        <span className="redline-inline-change-rewrite-badge">Proposed addition</span>
        <div className="redline-inline-ins-wrap">
          <p className="redline-inline-ins">{proposedText}</p>
        </div>
      </div>
    );
  }

  if (!proposedText) {
    return (
      <div className="redline-clause-inline-revision">
        <p className="redline-inline-del">{originalText}</p>
      </div>
    );
  }

  return (
    <div className="redline-clause-inline-revision">
      <span className="redline-inline-change-rewrite-badge">
        {showingRewrite ? "Proposed revision" : "Suggested language"}
      </span>
      {originalText && <p className="redline-inline-del">{originalText}</p>}
      <div className="redline-inline-ins-wrap">
        {showingRewrite && baseSuggested && (
          <p className="redline-inline-del redline-inline-del--compact">{baseSuggested}</p>
        )}
        <p className="redline-inline-ins">{proposedText}</p>
      </div>
    </div>
  );
}

function ClauseCard({
  clause,
  index,
  redlineId,
  agent,
  followups,
  onClauseFollowUpChange,
}: {
  clause: RedlineClause;
  index: number;
  redlineId?: string;
  agent: "nora" | "cassius";
  followups?: RedlineFollowUps;
  onClauseFollowUpChange?: (index: number, messages: RedlineFollowUpMessage[]) => void;
}) {
  const [open, setOpen] = useState(index < 3);
  const status = STATUS_STYLES[clause.status] ?? STATUS_STYLES.compliant;

  return (
    <div style={{
      border: "0.5px solid var(--bdr2)",
      borderRadius: 8, background: "var(--card)", marginBottom: 8, overflow: "hidden",
    }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--fg3)", fontWeight: 500 }}>{clause.clause_number}</span>
            <span style={{ fontSize: 10, color: "var(--fg3)" }}>·</span>
            <span style={{ fontSize: 10, color: status.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {status.label}
            </span>
            <span style={{ fontSize: 10, color: "var(--fg3)" }}>·</span>
            <span style={{ fontSize: 10, color: "var(--fg3)" }}>
              {DOMAIN_LABELS[clause.domain] ?? clause.domain}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", lineHeight: 1.35 }}>
            {clause.clause_title}
          </div>
        </div>

        <span style={{
          color: "var(--fg3)", fontSize: 13, display: "inline-block",
          transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0,
        }}>▾</span>
      </div>

      {open && (
        <div style={{ borderTop: "0.5px solid var(--bdr)", padding: "14px 16px" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
              Issue
            </div>
            <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.6 }}>{clause.issue}</div>
          </div>

          {(clause.original_text || clause.suggested_text) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  Language
                </div>
                {clause.suggested_text && (
                  <CopyButton text={getClauseInlineProposal(clause, index, followups)?.proposedText ?? clause.suggested_text} />
                )}
              </div>
              <InlineRedlineClauseLanguage clause={clause} index={index} followups={followups} />
            </div>
          )}

          {clause.frameworks?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {clause.frameworks.map((fw, i) => (
                <FrameworkRef key={i} label={fw} />
              ))}
            </div>
          )}

          {redlineId && (
            <RedlineFollowUp
              key={`${redlineId}-${redlineClauseThreadKey(index)}`}
              redlineId={redlineId}
              thread={redlineClauseThreadKey(index)}
              clauseIndex={index}
              agent={agent}
              initialMessages={getThreadMessages(followups, redlineClauseThreadKey(index))}
              onMessagesChange={msgs => onClauseFollowUpChange?.(index, msgs)}
              toggleLabel="Ask about this clause"
              hint="Ask why this was flagged, whether the suggested language is enough, or how to negotiate it."
              placeholder="Ask about this clause..."
            />
          )}
        </div>
      )}
    </div>
  );
}

function RedlinePositiveRow({
  text,
  index,
  redlineId,
  agent,
  followups,
  onPositiveFollowUpChange,
}: {
  text: string;
  index: number;
  redlineId?: string;
  agent: "nora" | "cassius";
  followups?: RedlineFollowUps;
  onPositiveFollowUpChange?: (index: number, messages: RedlineFollowUpMessage[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { title, detail } = parsePositiveClause(text);
  const body = detail || (title !== text ? null : text);

  return (
    <li className="redline-supplement-item">
      <div className="redline-supplement-item-copy">
        <span className="redline-supplement-item-title">{title}</span>
        {body && <span className="redline-supplement-item-detail">{body}</span>}
      </div>
      {redlineId && (
        <div className="redline-supplement-item-actions">
          <button
            type="button"
            className="redline-supplement-item-link"
            onClick={() => setOpen(v => !v)}
          >
            {open ? "Hide" : "Ask"}
          </button>
          {open && (
            <div className="redline-supplement-item-chat">
              <RedlineFollowUp
                key={`${redlineId}-${redlinePositiveThreadKey(index)}`}
                redlineId={redlineId}
                thread={redlinePositiveThreadKey(index)}
                positiveIndex={index}
                agent={agent}
                initialMessages={getThreadMessages(followups, redlinePositiveThreadKey(index))}
                onMessagesChange={msgs => onPositiveFollowUpChange?.(index, msgs)}
                toggleLabel="Ask about this clause"
                hint="Ask why this clause is solid, how to preserve it in negotiation, or what to watch for."
                placeholder="Ask about this clause..."
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function RedlineSupplement({
  missingClauses,
  positiveClauses,
  redlineId,
  agent,
  followups,
  onPositiveFollowUpChange,
}: {
  missingClauses:  string[];
  positiveClauses: string[];
  redlineId?:      string;
  agent:           "nora" | "cassius";
  followups?:      RedlineFollowUps;
  onPositiveFollowUpChange?: (index: number, messages: RedlineFollowUpMessage[]) => void;
}) {
  const [positiveOpen, setPositiveOpen] = useState(positiveClauses.length <= 6);

  if (!missingClauses.length && !positiveClauses.length) return null;

  return (
    <section className="redline-supplement">
      {missingClauses.length > 0 && (
        <div className="redline-supplement-block">
          <div className="redline-supplement-head">
            <h3 className="redline-supplement-title">Absent provisions</h3>
            <span className="redline-supplement-count">{missingClauses.length}</span>
          </div>
          <p className="redline-supplement-lead">
            These standard protections are not present in the agreement and should be addressed in negotiation.
          </p>
          <ul className="redline-supplement-list">
            {missingClauses.map((item, i) => (
              <li key={i} className="redline-supplement-item redline-supplement-item--missing">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {positiveClauses.length > 0 && (
        <div className={`redline-supplement-block${missingClauses.length ? " redline-supplement-block--divider" : ""}`}>
          <button
            type="button"
            className="redline-supplement-head redline-supplement-head--toggle"
            onClick={() => setPositiveOpen(v => !v)}
            aria-expanded={positiveOpen}
          >
            <h3 className="redline-supplement-title">Well drafted</h3>
            <span className="redline-supplement-count">{positiveClauses.length}</span>
            <span className={`redline-supplement-chevron${positiveOpen ? " open" : ""}`}>▾</span>
          </button>
          {!positiveOpen && (
            <p className="redline-supplement-lead">
              {positiveClauses.length} clause{positiveClauses.length === 1 ? "" : "s"} need no changes.
            </p>
          )}
          {positiveOpen && (
            <>
              <p className="redline-supplement-lead">
                Clauses that meet regulatory expectations and do not require redlines.
              </p>
              <ul className="redline-supplement-list">
                {positiveClauses.map((text, i) => (
                  <RedlinePositiveRow
                    key={i}
                    text={text}
                    index={i}
                    redlineId={redlineId}
                    agent={agent}
                    followups={followups}
                    onPositiveFollowUpChange={onPositiveFollowUpChange}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function RedlineCard({
  redline,
  redlineId,
  sourceText,
  followups,
  onFollowupsChange,
  decisions,
  onDecisionsChange,
}: {
  redline: RedlineOutput;
  redlineId?: string;
  sourceText?: string | null;
  followups?: RedlineFollowUps;
  onFollowupsChange?: (followups: RedlineFollowUps) => void;
  decisions?: ChangeDecisions;
  onDecisionsChange?: (decisions: ChangeDecisions) => void;
}) {
  const agentLabel = redline.redline_by === "nora" ? "Nora" : "Cassius";
  const agent = redline.redline_by === "cassius" ? "cassius" : "nora";

  const handleClauseFollowUpChange = (index: number, messages: RedlineFollowUpMessage[]) => {
    onFollowupsChange?.({
      ...(followups ?? {}),
      clauses: { ...(followups?.clauses ?? {}), [String(index)]: messages },
    });
  };

  const handleGeneralFollowUpChange = (messages: RedlineFollowUpMessage[]) => {
    onFollowupsChange?.({
      ...(followups ?? {}),
      general: messages,
    });
  };

  const handlePositiveFollowUpChange = (index: number, messages: RedlineFollowUpMessage[]) => {
    onFollowupsChange?.({
      ...(followups ?? {}),
      positive: { ...(followups?.positive ?? {}), [String(index)]: messages },
    });
  };

  return (
    <div style={{ fontFamily: "var(--font-sora, 'Sora', sans-serif)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
        fontSize: 11, color: "var(--fg3)", fontWeight: 500,
      }}>
        <Shield size={11} color="var(--fg3)" />
        {agentLabel} · Agreement Review
      </div>

      <div className="redline-review-meta">
        <div className="redline-review-meta-title">{redline.agreement_type || "Agreement"}</div>
        <div className="redline-review-meta-sub">
          {redline.governing_law && <span>{redline.governing_law}</span>}
          {redline.parties?.length > 0 && (
            <span>{redline.governing_law ? " · " : ""}{redline.parties.join(" — ")}</span>
          )}
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.7, marginBottom: 20 }}>{redline.summary}</p>

      {sourceText && decisions && onDecisionsChange && (
        <RedlineDocumentView
          sourceText={sourceText}
          redline={redline}
          decisions={decisions}
          onDecisionsChange={onDecisionsChange}
          followups={followups}
          redlineId={redlineId}
          agent={agent}
          onClauseFollowUpChange={handleClauseFollowUpChange}
        />
      )}

      {!sourceText && redline.clauses?.length > 0 && (
        <p className="redline-document-fallback">
          Full contract text is not available for this review. Showing clause-by-clause findings below.
        </p>
      )}

      <RedlineSupplement
        missingClauses={redline.missing_clauses ?? []}
        positiveClauses={redline.positive_clauses ?? []}
        redlineId={redlineId}
        agent={agent}
        followups={followups}
        onPositiveFollowUpChange={handlePositiveFollowUpChange}
      />

      {redline.frameworks?.length > 0 && (
        <div className="redline-supplement-frameworks">
          <div className="redline-supplement-head">
            <h3 className="redline-supplement-title">Applicable frameworks</h3>
          </div>
          <div className="redline-supplement-framework-pills">
            {redline.frameworks.map((fw, i) => (
              <FrameworkRef key={i} label={fw} />
            ))}
          </div>
        </div>
      )}
      {!sourceText && redline.clauses?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
            Clause review · {redline.clauses.length} issue{redline.clauses.length !== 1 ? "s" : ""}
          </div>
          {redline.clauses.map((clause, i) => (
            <ClauseCard
              key={i}
              clause={clause}
              index={i}
              redlineId={redlineId}
              agent={agent}
              followups={followups}
              onClauseFollowUpChange={handleClauseFollowUpChange}
            />
          ))}
        </div>
      )}

      {redlineId && (
        <RedlineFollowUp
          key={`${redlineId}-general`}
          redlineId={redlineId}
          thread="general"
          agent={agent}
          initialMessages={getThreadMessages(followups, "general")}
          onMessagesChange={handleGeneralFollowUpChange}
          toggleLabel="Ask about this review"
          hint="Ask about overall risk, missing clauses, negotiation strategy, or how findings fit together."
          placeholder="Ask about this review..."
        />
      )}
    </div>
  );
}
