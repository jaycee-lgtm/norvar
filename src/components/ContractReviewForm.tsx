"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FolderOpen, Loader2, Search, Shield, Upload } from "lucide-react";
import { readSSEStream } from "@/lib/sse";
import type { RedlineOutput } from "@/lib/redline";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";
import type { UserDocument } from "@/lib/documents";

type InputMode = "documents" | "upload" | "paste";

export default function ContractReviewForm({
  initialDocumentId,
  onDone,
  variant = "home",
  onCancel,
}: {
  initialDocumentId?: string | null;
  onDone:             () => void;
  variant?:           "home" | "modal";
  onCancel?:          () => void;
}) {
  const fileRef                     = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode]   = useState<InputMode>("documents");
  const [documents, setDocuments]   = useState<UserDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docQuery, setDocQuery]     = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialDocumentId ?? null);
  const [file, setFile]             = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [agent, setAgent]           = useState<"cassius" | "nora">("nora");
  const [jurisdictions, setJurisdictions] = useState("");
  const [statusText, setStatusText] = useState("");
  const [working, setWorking]       = useState(false);
  const [error, setError]           = useState("");

  const isHome = variant === "home";

  useEffect(() => {
    if (inputMode !== "documents") return;
    setDocsLoading(true);
    fetch("/api/documents?status=active")
      .then(r => r.json())
      .then(d => setDocuments(d.documents ?? []))
      .catch(() => setDocuments([]))
      .finally(() => setDocsLoading(false));
  }, [inputMode]);

  useEffect(() => {
    if (initialDocumentId) {
      setSelectedDocId(initialDocumentId);
      setInputMode("documents");
    }
  }, [initialDocumentId]);

  const filteredDocs = documents.filter(d =>
    !docQuery.trim() || d.name.toLowerCase().includes(docQuery.toLowerCase()),
  );

  const extractFileText = async (f: File): Promise<string> => {
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/documents/extract", { method: "POST", body: form });
    const data = await res.json() as { text?: string; error?: string };
    if (!res.ok) throw new Error(data.error || "Could not read file");
    return data.text ?? "";
  };

  const submit = async () => {
    setError("");
    setWorking(true);

    try {
      let body: Record<string, unknown> = {
        agent,
        jurisdictions: jurisdictions.split(",").map(j => j.trim()).filter(Boolean),
      };

      if (inputMode === "documents") {
        if (!selectedDocId) {
          setError("Select a document from your library.");
          setWorking(false);
          return;
        }
        body = { ...body, document_id: selectedDocId };
        setStatusText("Fetching document...");
      } else if (inputMode === "upload") {
        if (!file) {
          setError("Choose a file or use another input method.");
          setWorking(false);
          return;
        }
        setStatusText("Reading document...");
        const contractText = await extractFileText(file);
        if (contractText.length < 100) {
          setError("Could not extract enough text from this file.");
          setWorking(false);
          return;
        }
        body = { ...body, contract_text: contractText };
      } else {
        const contractText = pastedText.trim();
        if (contractText.length < 100) {
          setError("Please provide at least 100 characters of contract text.");
          setWorking(false);
          return;
        }
        body = { ...body, contract_text: contractText };
      }

      setStatusText(`${agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name} is reviewing clauses...`);

      const res = await fetch("/api/redline", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Redline failed");
      }

      let redline: RedlineOutput | null = null;
      await readSSEStream(res, event => {
        if (event.type === "status") setStatusText(event.text ?? "");
        if (event.type === "done") redline = (event as { redline?: RedlineOutput }).redline ?? null;
        if (event.type === "error") throw new Error(event.text ?? "Redline failed");
      });

      if (!redline) throw new Error("No redline output received");
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setWorking(false);
      setStatusText("");
    }
  };

  const modes: { id: InputMode; label: string }[] = [
    { id: "documents", label: "Documents" },
    { id: "upload", label: "Upload" },
    { id: "paste", label: "Paste" },
  ];

  const sourcePanel = (
    <>
      <div className={`contract-review-mode-row${isHome ? " contract-review-mode-row--home" : ""}`}>
        {modes.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setInputMode(m.id)}
            disabled={working}
            className={`contract-review-mode${inputMode === m.id ? " active" : ""}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {inputMode === "documents" && (
        <div className="contract-review-doc-picker">
          <div className="contract-review-doc-search">
            <Search size={12} color="var(--fg3)" />
            <input
              value={docQuery}
              onChange={e => setDocQuery(e.target.value)}
              placeholder="Search documents..."
              disabled={working}
            />
          </div>
          <div className={`contract-review-doc-list${isHome ? " contract-review-doc-list--home" : ""}`}>
            {docsLoading && (
              <div className="contract-review-doc-empty">
                <Loader2 size={14} className="spin" /> Loading...
              </div>
            )}
            {!docsLoading && filteredDocs.length === 0 && (
              <div className="contract-review-doc-empty">
                <FolderOpen size={16} color="var(--fg4)" />
                <p>{documents.length === 0 ? "Upload agreements under Documents first." : "No matches."}</p>
              </div>
            )}
            {!docsLoading && filteredDocs.map(doc => (
              <button
                key={doc.id}
                type="button"
                disabled={working}
                onClick={() => setSelectedDocId(doc.id)}
                className={`contract-review-doc-row${selectedDocId === doc.id ? " active" : ""}`}
              >
                <span className="contract-review-doc-type">{(doc.file_type ?? "file").slice(0, 3).toUpperCase()}</span>
                <span className="contract-review-doc-name">{doc.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {inputMode === "upload" && (
        <div
          className={`contract-review-dropzone${file ? " has-file" : ""}${isHome ? " contract-review-dropzone--home" : ""}`}
          onClick={() => !working && fileRef.current?.click()}
        >
          <Upload size={18} color="var(--fg3)" />
          {file ? <p>{file.name}</p> : <p>PDF, DOCX, or TXT</p>}
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
        </div>
      )}

      {inputMode === "paste" && (
        <textarea
          className={`contract-review-textarea${isHome ? " contract-review-textarea--home" : ""}`}
          value={pastedText}
          onChange={e => setPastedText(e.target.value)}
          placeholder="Paste contract text..."
          disabled={working}
          rows={isHome ? 3 : 6}
        />
      )}
    </>
  );

  if (isHome) {
    return (
      <div className="contracts-review-home">
        <div className="mobile-composer contracts-home-composer">
          <div className="contracts-home-composer-body">
            {sourcePanel}
          </div>
          <div className="mobile-composer-tools mobile-composer-tools--minimal">
            <div className="composer-toolbar-start contracts-home-agents">
              {(["nora", "cassius"] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  disabled={working}
                  onClick={() => setAgent(a)}
                  className={`contracts-home-agent${agent === a ? " active" : ""}`}
                >
                  <Shield size={11} />
                  {a === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
                </button>
              ))}
            </div>
            <div className="mobile-composer-actions">
              <button
                type="button"
                className="send-btn"
                onClick={() => { void submit(); }}
                disabled={working}
                aria-label="Start review"
              >
                {working ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </div>
        {!working && (
          <input
            className="contract-review-input contracts-home-jurisdictions"
            value={jurisdictions}
            onChange={e => setJurisdictions(e.target.value)}
            disabled={working}
            placeholder="Jurisdiction hints (optional) — e.g. EU, UK, US"
          />
        )}
        {working && statusText && <p className="contract-review-status contracts-home-status">{statusText}</p>}
        {error && <p className="contract-review-error contracts-home-error">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="contract-review-field">
        <span className="contract-review-label">Reviewed by</span>
        <div className="contract-review-agent-row">
          {(["nora", "cassius"] as const).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setAgent(a)}
              disabled={working}
              className={`contract-review-agent${agent === a ? " active" : ""}`}
            >
              <Shield size={11} />
              {a === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
            </button>
          ))}
        </div>
      </div>

      <div className="contract-review-field">
        <span className="contract-review-label">Contract source</span>
        {sourcePanel}
      </div>

      <div className="contract-review-field">
        <span className="contract-review-label">Jurisdiction hints (optional)</span>
        <input
          className="contract-review-input"
          value={jurisdictions}
          onChange={e => setJurisdictions(e.target.value)}
          disabled={working}
          placeholder="e.g. EU, UK, US"
        />
      </div>

      {working && statusText && <p className="contract-review-status">{statusText}</p>}
      {error && <p className="contract-review-error">{error}</p>}

      <div className="app-modal-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={working} className="app-modal-btn app-modal-btn--ghost">
            Cancel
          </button>
        )}
        <button type="button" onClick={() => { void submit(); }} disabled={working} className="app-modal-btn app-modal-btn--primary">
          {working ? "Reviewing..." : "Start review"}
        </button>
      </div>
    </>
  );
}
