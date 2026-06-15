"use client";

import { useState } from "react";
import { Shield, Copy, Check, ChevronDown, AlertCircle, Download } from "lucide-react";
import { buildFullDraftText, type DraftOutput, type DraftSection } from "@/lib/draft";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";
import FrameworkRef from "@/components/FrameworkRef";

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

function SectionBlock({ section }: { section: DraftSection }) {
  const [open, setOpen] = useState(true);

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

      {open && (
        <div className="draft-clause-panel-body">
          {section.clauses.map(clause => (
            <div key={clause.number} className="draft-clause-item">
              <div className="draft-clause-item-head">
                <span className="draft-clause-item-num">{clause.number}</span>
                <span className="draft-clause-item-title">{clause.title}</span>
                <CopyButton text={`${clause.number}  ${clause.title}\n${clause.text}`} />
              </div>
              <p className="draft-clause-item-text">{clause.text}</p>
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
  onExport,
}: {
  draft:     DraftOutput;
  draftId?:  string;
  onExport?: (format: "docx" | "txt") => void;
}) {
  const agentLabel = draft.drafted_by === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name;
  const fullDocText = buildFullDraftText(draft);
  const clauseCount = draft.sections?.reduce((n, s) => n + s.clauses.length, 0) ?? 0;

  const handleExport = (format: "docx" | "txt") => {
    if (onExport) {
      onExport(format);
      return;
    }
    if (!draftId) return;
    void fetch("/api/draft/export", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ draft_id: draftId, format }),
    })
      .then(async res => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Export failed");
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = disposition.match(/filename="([^"]+)"/);
        const filename = match?.[1] ?? `agreement.${format}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(err => alert(err instanceof Error ? err.message : "Export failed"));
  };

  return (
    <div className="draft-card">
      <div className="draft-card-agent">
        <Shield size={11} color="var(--fg3)" />
        {agentLabel} · Agreement Draft
      </div>

      <div className="redline-apply-bar draft-card-toolbar">
        <div className="redline-apply-actions">
          <CopyButton text={fullDocText} label="Copy all" />
          <button type="button" className="redline-apply-btn redline-apply-btn--download" onClick={() => handleExport("docx")}>
            <Download size={11} /> DOCX
          </button>
          <button type="button" className="redline-apply-btn redline-apply-btn--download" onClick={() => handleExport("txt")}>
            <Download size={11} /> TXT
          </button>
        </div>
      </div>

      <div className="redline-review-meta">
        <div className="redline-review-meta-title">{draft.title || draft.agreement_type}</div>
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
        <SectionBlock key={section.number} section={section} />
      ))}

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
