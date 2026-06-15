"use client";

import { useEffect, useState } from "react";
import { Check, Download, FolderOpen, Loader2 } from "lucide-react";

type ProjectFolder = { id: string; name: string };

async function downloadDraft(draftId: string, format: "docx" | "pdf" | "txt") {
  const res = await fetch("/api/draft/export", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ draft_id: draftId, format }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Download failed");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `agreement.${format}`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DraftActionsBar({
  draftId,
  folderId,
  documentId,
  onSaved,
}: {
  draftId:     string;
  folderId?:   string | null;
  documentId?: string | null;
  onSaved?:    (meta: { document_id: string; folder_id: string | null; filename: string }) => void;
}) {
  const [folders, setFolders]       = useState<ProjectFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState(folderId ?? "");
  const [busy, setBusy]             = useState<string | null>(null);
  const [error, setError]           = useState("");
  const [savedDocId, setSavedDocId] = useState(documentId ?? null);

  useEffect(() => {
    void fetch("/api/folders")
      .then(r => r.json())
      .then(d => setFolders((d.folders ?? []).map((f: ProjectFolder) => ({ id: f.id, name: f.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedFolder(folderId ?? "");
    setSavedDocId(documentId ?? null);
  }, [folderId, documentId]);

  const saveToProject = async (format: "docx" | "pdf") => {
    setBusy(`save-${format}`);
    setError("");
    try {
      const res = await fetch("/api/draft/save", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          draft_id:  draftId,
          folder_id:   selectedFolder || null,
          format,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error || "Save failed");
      setSavedDocId(data.document_id);
      onSaved?.({
        document_id: data.document_id,
        folder_id:   data.folder_id ?? null,
        filename:    data.filename,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const download = async (format: "docx" | "pdf" | "txt") => {
    setBusy(`download-${format}`);
    setError("");
    try {
      await downloadDraft(draftId, format);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="redline-apply-bar draft-card-toolbar">
      <div className="redline-apply-actions draft-actions-row">
        <button
          type="button"
          className="redline-apply-btn redline-apply-btn--download"
          disabled={!!busy}
          onClick={() => void download("docx")}
        >
          {busy === "download-docx" ? <Loader2 size={11} className="spin" /> : <Download size={11} />}
          DOCX
        </button>
        <button
          type="button"
          className="redline-apply-btn redline-apply-btn--download"
          disabled={!!busy}
          onClick={() => void download("pdf")}
        >
          {busy === "download-pdf" ? <Loader2 size={11} className="spin" /> : <Download size={11} />}
          PDF
        </button>
        <button
          type="button"
          className="redline-apply-btn redline-apply-btn--download"
          disabled={!!busy}
          onClick={() => void download("txt")}
        >
          {busy === "download-txt" ? <Loader2 size={11} className="spin" /> : <Download size={11} />}
          TXT
        </button>

        <div className="draft-save-project">
          <FolderOpen size={11} color="var(--fg3)" />
          <select
            className="draft-save-project-select"
            value={selectedFolder}
            onChange={e => setSelectedFolder(e.target.value)}
            disabled={!!busy}
          >
            <option value="">No project</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="redline-apply-btn redline-apply-btn--secondary"
            disabled={!!busy}
            onClick={() => void saveToProject("docx")}
          >
            {busy === "save-docx" ? <Loader2 size={11} className="spin" /> : <Check size={11} />}
            Save to project
          </button>
        </div>

        {savedDocId && (
          <span className="draft-saved-badge">
            <Check size={10} /> Saved to Documents
          </span>
        )}
      </div>
      {error && <p className="contract-review-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
