"use client";

import { useMemo, useState } from "react";
import { Shield, Copy, Check, ChevronDown, AlertCircle } from "lucide-react";
import { buildFullDraftText, type DraftOutput, type DraftSection } from "@/lib/draft";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";
import FrameworkRef from "@/components/FrameworkRef";
import DraftFollowUp from "@/components/DraftFollowUp";
import DraftActionsBar from "@/components/DraftActionsBar";
import {
  draftSectionThreadKey,
  getDraftThreadMessages,
  type DraftFollowUpMessage,
  type DraftFollowUps,
} from "@/lib/draft-followup";
import {
  getSectionClauseRevisions,
  type ClauseRevision,
} from "@/lib/draft-inline";

const SECTION_QUICK_ACTIONS = [
  {
    label:    "Suggest revisions",
    message:  "Please suggest revisions to this section. Provide the full updated section under **Revised language:**",
    autoSend: true,
  },
  {
    label:    "Explain obligations",
    message:  "Explain the key obligations in this section in plain language.",
    autoSend: true,
  },
  {
    label:    "What's missing?",
    message:  "What provisions are missing from this section given the jurisdictions and context?",
    autoSend: true,
  },
];

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="redline-apply-btn redline-apply-btn--secondary draft-copy-btn"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function InlineDraftClauseText({
  text,
  revision,
}: {
  text:      string;
  revision?: ClauseRevision | null;
}) {
  if (!revision) {
    return <p className="draft-clause-item-text">{text}</p>;
  }

  return (
    <div className="draft-clause-inline-revision">
      <span className="redline-inline-change-rewrite-badge">Proposed revision</span>
      <p className="redline-inline-del">{revision.originalText}</p>
      <div className="redline-inline-ins-wrap">
        <p className="redline-inline-ins">{revision.proposedText}</p>
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  draftId,
  agent,
  followups,
  onSectionFollowupsChange,
}: {
  section:                   DraftSection;
  draftId?:                  string;
  agent:                     "nora" | "cassius";
  followups?:                DraftFollowUps;
  onSectionFollowupsChange?: (sectionNumber: string, messages: DraftFollowUpMessage[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const thread = draftSectionThreadKey(section.number);

  const clauseRevisions = useMemo(
    () => getSectionClauseRevisions(section, followups),
    [section, followups],
  );

  const fullText = section.clauses.map(c =>
    `${c.number}  ${c.title}\n${c.text}`,
  ).join("\n\n");

  return (
    <div className="draft-clause-panel">
      <button
        type="button"
        className="draft-clause-panel-head"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className="draft-clause-panel-num">{section.number}</span>
        <span className="draft-clause-panel-title">{section.title}</span>
        <span className="draft-clause-panel-count">
          {section.clauses.length} clause{section.clauses.length !== 1 ? "s" : ""}
        </span>
        <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <CopyButton text={fullText} />
        </span>
        <ChevronDown
          size={13}
          color="var(--fg3)"
          className={`draft-clause-panel-chevron${open ? " open" : ""}`}
        />
      </button>

      {draftId && (
        <div className="draft-section-followup-wrap">
          <DraftFollowUp
            draftId={draftId}
            thread={thread}
            sectionNumber={section.number}
            agent={agent}
            initialMessages={getDraftThreadMessages(followups, thread)}
            onMessagesChange={msgs => onSectionFollowupsChange?.(section.number, msgs)}
            toggleLabel="Ask about this section"
            hint="Ask questions before or after reviewing this section, or suggest updates to the language."
            quickActions={SECTION_QUICK_ACTIONS}
          />
        </div>
      )}

      {open && (
        <div className="draft-clause-panel-body">
          {section.clauses.map(clause => (
            <div key={clause.number} className="draft-clause-item">
              <div className="draft-clause-item-head">
                <span className="draft-clause-item-num">{clause.number}</span>
                <span className="draft-clause-item-title">{clause.title}</span>
                <CopyButton text={`${clause.number}  ${clause.title}\n${clause.text}`} />
              </div>
              <InlineDraftClauseText
                text={clause.text}
                revision={clauseRevisions.get(clause.number)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DraftCard({
  draft,
  draftId,
  agent = draft.drafted_by ?? "cassius",
  followups,
  onFollowupsChange,
  folderId,
  documentId,
  onSaved,
}: {
  draft:              DraftOutput;
  draftId?:           string;
  agent?:             "nora" | "cassius";
  followups?:         DraftFollowUps;
  onFollowupsChange?: (next: DraftFollowUps) => void;
  folderId?:          string | null;
  documentId?:        string | null;
  onSaved?:           (meta: { document_id: string; folder_id: string | null; filename: string }) => void;
}) {
  const agentLabel  = agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name;
  const displayTitle = draft.document_name || draft.title || draft.agreement_type;
  const fullDocText = buildFullDraftText(draft);
  const clauseCount = draft.sections?.reduce((n, s) => n + s.clauses.length, 0) ?? 0;

  const handleSectionFollowups = (sectionNumber: string, messages: DraftFollowUpMessage[]) => {
    if (!onFollowupsChange) return;
    onFollowupsChange({
      ...(followups ?? {}),
      sections: {
        ...(followups?.sections ?? {}),
        [sectionNumber]: messages,
      },
    });
  };

  const handleGeneralFollowups = (messages: DraftFollowUpMessage[]) => {
    onFollowupsChange?.({ ...(followups ?? {}), general: messages });
  };

  return (
    <div className="draft-card">
      <div className="draft-card-agent">
        <Shield size={11} color="var(--fg3)" />
        {agentLabel} · Agreement Draft
      </div>

      {draftId ? (
        <DraftActionsBar
          draftId={draftId}
          folderId={folderId}
          documentId={documentId}
          onSaved={onSaved}
        />
      ) : (
        <div className="redline-apply-bar draft-card-toolbar">
          <div className="redline-apply-actions">
            <CopyButton text={fullDocText} label="Copy all" />
          </div>
        </div>
      )}

      <div className="redline-review-meta">
        <div className="redline-review-meta-title">{displayTitle}</div>
        <div className="redline-review-meta-sub">
          {draft.parties?.provider ?? "[Provider]"}
          {" — "}
          {draft.parties?.customer ?? "[Customer]"}
          {draft.governing_law ? ` · ${draft.governing_law}` : ""}
        </div>
      </div>

      {draft.summary && (
        <p className="draft-card-summary">{draft.summary}</p>
      )}

      {draft.drafting_notes?.length > 0 && (
        <section className="redline-supplement draft-notes-panel">
          <div className="redline-supplement-block">
            <div className="redline-supplement-head">
              <AlertCircle size={12} color="var(--rm, #854F0B)" />
              <h3 className="redline-supplement-title">Drafting notes — review before sending</h3>
            </div>
            <ul className="redline-supplement-list">
              {draft.drafting_notes.map((note, i) => (
                <li key={i} className="redline-supplement-item redline-supplement-item--missing">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="draft-sections-label">
        {draft.sections?.length ?? 0} sections · {clauseCount} clauses
      </div>

      {draft.sections?.map(section => (
        <SectionBlock
          key={section.number}
          section={section}
          draftId={draftId}
          agent={agent}
          followups={followups}
          onSectionFollowupsChange={handleSectionFollowups}
        />
      ))}

      {draftId && (
        <div className="draft-general-followup">
          <DraftFollowUp
            draftId={draftId}
            thread="general"
            agent={agent}
            initialMessages={getDraftThreadMessages(followups, "general")}
            onMessagesChange={handleGeneralFollowups}
            toggleLabel="Ask about this draft"
            hint="Ask about the full agreement, suggest overall updates, or get negotiation guidance."
            quickActions={[
              {
                label:    "Suggest overall updates",
                message:  "Review the full draft and suggest the most important updates. Use **Revised language:** for any replacement text.",
                autoSend: true,
              },
              {
                label:    "Negotiation priorities",
                message:  "What should we prioritise in negotiation based on this draft?",
                autoSend: true,
              },
              {
                label:    "Gap check",
                message:  "What material gaps or risks remain in this draft?",
                autoSend: true,
              },
            ]}
          />
        </div>
      )}

      {draft.frameworks?.length > 0 && (
        <div className="redline-supplement-frameworks">
          <div className="redline-supplement-head">
            <h3 className="redline-supplement-title">Grounded in</h3>
          </div>
          <div className="redline-supplement-framework-pills">
            {draft.frameworks.map((fw, i) => (
              <FrameworkRef key={i} label={fw} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
