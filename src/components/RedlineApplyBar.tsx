"use client";

import { useState } from "react";
import { Check, Download, FileText, Loader2, Sparkles } from "lucide-react";
import type { AppliedMeta } from "@/lib/redline-apply";
import type { ChangeDecisions } from "@/lib/redline-inline";

type RedlineApplyBarProps = {
  redlineId:           string;
  appliedMeta?:        AppliedMeta | null;
  hasFollowups?:       boolean;
  decisions?:          ChangeDecisions;
  hasInlineDocument?:  boolean;
  onApplied?:          (meta: AppliedMeta) => void;
};

async function downloadExport(
  redlineId: string,
  format: "docx" | "pdf",
  includeRewrites: boolean,
  decisions?: ChangeDecisions,
) {
  const res = await fetch("/api/redline/export", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      redline_id:       redlineId,
      format,
      include_rewrites: includeRewrites,
      apply_first:      true,
      decisions,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Download failed");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `contract-redlined.${format}`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function RedlineApplyBar({
  redlineId,
  appliedMeta,
  hasFollowups = false,
  decisions,
  hasInlineDocument = false,
  onApplied,
}: RedlineApplyBarProps) {
  const [busy, setBusy]           = useState<string | null>(null);
  const [error, setError]         = useState("");
  const [meta, setMeta]           = useState<AppliedMeta | null>(appliedMeta ?? null);

  const apply = async (includeRewrites: boolean) => {
    setBusy(includeRewrites ? "apply-rewrites" : "apply");
    setError("");
    try {
      const res = await fetch("/api/redline/apply", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          redline_id:       redlineId,
          include_rewrites: includeRewrites,
          decisions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not apply changes");
      setMeta(data.applied_meta as AppliedMeta);
      onApplied?.(data.applied_meta as AppliedMeta);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not apply changes");
    } finally {
      setBusy(null);
    }
  };

  const download = async (format: "docx" | "pdf", includeRewrites: boolean) => {
    setBusy(`download-${format}-${includeRewrites ? "rewrites" : "base"}`);
    setError("");
    try {
      await downloadExport(redlineId, format, includeRewrites, decisions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const activeMeta = meta ?? appliedMeta;
  const applyLabel = hasInlineDocument ? "Apply accepted changes" : "Apply all proposed changes";

  return (
    <div className="redline-apply-bar">
      <div className="redline-apply-actions">
        <button
          type="button"
          className="redline-apply-btn"
          disabled={!!busy}
          onClick={() => void apply(false)}
        >
          {busy === "apply" ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
          {applyLabel}
        </button>

        {hasFollowups && (
          <button
            type="button"
            className="redline-apply-btn redline-apply-btn--secondary"
            disabled={!!busy}
            onClick={() => void apply(true)}
          >
            {busy === "apply-rewrites" ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
            {hasInlineDocument ? "Apply accepted & rewrites" : "Apply all changes & rewrites"}
          </button>
        )}
      </div>

      <div className="redline-apply-actions">
        <button
          type="button"
          className="redline-apply-btn redline-apply-btn--download"
          disabled={!!busy}
          onClick={() => void download("docx", false)}
        >
          {busy === "download-docx-base" ? <Loader2 size={12} className="spin" /> : <FileText size={12} />}
          {hasInlineDocument ? "Download Word (accepted)" : "Download Word"}
        </button>
        <button
          type="button"
          className="redline-apply-btn redline-apply-btn--download"
          disabled={!!busy}
          onClick={() => void download("pdf", false)}
        >
          {busy === "download-pdf-base" ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
          {hasInlineDocument ? "Download PDF (accepted)" : "Download PDF"}
        </button>
        {hasFollowups && (
          <>
            <button
              type="button"
              className="redline-apply-btn redline-apply-btn--download"
              disabled={!!busy}
              onClick={() => void download("docx", true)}
            >
              {busy === "download-docx-rewrites" ? <Loader2 size={12} className="spin" /> : <FileText size={12} />}
              Word with rewrites
            </button>
            <button
              type="button"
              className="redline-apply-btn redline-apply-btn--download"
              disabled={!!busy}
              onClick={() => void download("pdf", true)}
            >
              {busy === "download-pdf-rewrites" ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
              PDF with rewrites
            </button>
          </>
        )}
      </div>

      {activeMeta && (
        <p className="redline-apply-meta">
          Applied {activeMeta.clauses_applied} change{activeMeta.clauses_applied === 1 ? "" : "s"}
          {activeMeta.missing_added ? ` · ${activeMeta.missing_added} added` : ""}
          {activeMeta.followup_rewrites_used ? ` · ${activeMeta.followup_rewrites_used} follow-up rewrite${activeMeta.followup_rewrites_used === 1 ? "" : "s"}` : ""}
          {activeMeta.clauses_skipped ? ` · ${activeMeta.clauses_skipped} could not be matched automatically` : ""}
        </p>
      )}

      {error && <p className="redline-apply-error">{error}</p>}
    </div>
  );
}
