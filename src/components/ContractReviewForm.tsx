"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import DocumentPicker, { SelectedDocumentChips } from "@/components/DocumentPicker";
import ModeSelector, { type Mode } from "@/components/ModeSelector";
import { readSSEStream } from "@/lib/sse";
import type { RedlineOutput } from "@/lib/redline";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";

type InputMode = "document" | "upload" | "paste";

export default function ContractReviewForm({
  initialDocumentId,
  onDone,
  variant = "home",
  isMobileView = false,
  onCancel,
}: {
  initialDocumentId?: string | null;
  onDone:             () => void;
  variant?:           "home" | "modal";
  isMobileView?:      boolean;
  onCancel?:          () => void;
}) {
  const fileRef                     = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode]   = useState<InputMode>("document");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialDocumentId ?? null);
  const [docCatalog, setDocCatalog] = useState<Record<string, string>>({});
  const [uploadName, setUploadName] = useState("");
  const [contractText, setContractText] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [agent, setAgent]           = useState<"cassius" | "nora">("nora");
  const [jurisdictions, setJurisdictions] = useState("");
  const [statusText, setStatusText] = useState("");
  const [working, setWorking]       = useState(false);
  const [fileExtracting, setFileExtracting] = useState(false);
  const [error, setError]           = useState("");

  const isHome = variant === "home";
  const agentMode: Mode = agent === "nora" ? "chat" : "assess";
  const agentName = agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name;

  useEffect(() => {
    fetch("/api/documents?status=active")
      .then(r => r.json())
      .then(d => {
        const map: Record<string, string> = {};
        for (const doc of d.documents ?? []) map[doc.id] = doc.name;
        setDocCatalog(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialDocumentId) {
      setSelectedDocId(initialDocumentId);
      setInputMode("document");
    }
  }, [initialDocumentId]);

  const extractFileText = async (f: File): Promise<string> => {
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/documents/extract", { method: "POST", body: form });
    const data = await res.json() as { text?: string; error?: string };
    if (!res.ok) throw new Error(data.error || "Could not read file");
    return data.text ?? "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFileExtracting(true);
    setError("");
    try {
      const text = await extractFileText(f);
      setContractText(text);
      setUploadName(f.name);
      setSelectedDocId(null);
      setInputMode("upload");
      setPastedText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setFileExtracting(false);
    }
  };

  const clearSource = () => {
    setSelectedDocId(null);
    setContractText("");
    setUploadName("");
    setPastedText("");
    setInputMode("document");
  };

  const canSend = working
    ? false
    : inputMode === "document"
    ? !!selectedDocId
    : inputMode === "paste"
    ? pastedText.trim().length >= 100
    : contractText.trim().length >= 100;

  const submit = async () => {
    setError("");
    setWorking(true);

    try {
      const body: Record<string, unknown> = {
        agent,
        jurisdictions: jurisdictions.split(",").map(j => j.trim()).filter(Boolean),
      };

      if (inputMode === "document") {
        if (!selectedDocId) {
          setError("Choose a contract from Documents.");
          setWorking(false);
          return;
        }
        body.document_id = selectedDocId;
        setStatusText("Fetching document...");
      } else {
        const text = inputMode === "paste" ? pastedText.trim() : contractText.trim();
        if (text.length < 100) {
          setError("Please provide at least 100 characters of contract text.");
          setWorking(false);
          return;
        }
        body.contract_text = text;
        setStatusText("Reading contract...");
      }

      setStatusText(`${agentName} is reviewing clauses...`);

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

  const agentSelector = (
    <ModeSelector
      current={agentMode}
      embedded
      menuPlacement="top"
      navigate={false}
      disabled={working}
      onSelect={mode => setAgent(mode === "chat" ? "nora" : "cassius")}
    />
  );

  const attachControl = (
    <DocumentPicker
      selectedIds={selectedDocId ? [selectedDocId] : []}
      onChange={ids => {
        const id = ids.length ? ids[ids.length - 1] : null;
        setSelectedDocId(id);
        if (id) {
          setInputMode("document");
          setContractText("");
          setUploadName("");
          setPastedText("");
        }
      }}
      disabled={working || fileExtracting}
      variant="icon"
      onUpload={() => fileRef.current?.click()}
      uploading={fileExtracting}
    />
  );

  const pasteToggle = (
    <button
      type="button"
      className={`contracts-paste-toggle${inputMode === "paste" ? " active" : ""}`}
      disabled={working}
      onClick={() => {
        setInputMode("paste");
        setSelectedDocId(null);
        setContractText("");
        setUploadName("");
      }}
    >
      Paste
    </button>
  );

  const sendButton = (
    <button
      type="button"
      className="send-btn"
      onClick={() => { void submit(); }}
      disabled={!canSend}
      aria-label="Start review"
    >
      {working ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} strokeWidth={2.5} />}
    </button>
  );

  const sourceLabel = inputMode === "document" && selectedDocId
    ? docCatalog[selectedDocId] ?? "Selected document"
    : inputMode === "upload" && uploadName
    ? uploadName
    : null;

  const homeComposer = isMobileView ? (
    <div className="mobile-composer">
      {(selectedDocId || uploadName) && (
        <div style={{ padding: "0 12px 8px" }}>
          <SelectedDocumentChips
            documents={selectedDocId ? [{ id: selectedDocId, name: docCatalog[selectedDocId] ?? "Document" }] : []}
            onRemove={() => clearSource()}
          />
          {uploadName && !selectedDocId && (
            <span style={{
              fontSize: 11, color: "var(--fg2)", background: "var(--card2)",
              padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)",
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "'Sora', sans-serif",
            }}>
              {uploadName}
              <button type="button" onClick={clearSource} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "var(--fg3)" }}>×</button>
            </span>
          )}
        </div>
      )}
      <div className="mobile-composer-input-row">
        {inputMode === "paste" ? (
          <textarea
            className="input-textarea mobile-composer-field"
            placeholder="Paste contract text..."
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            disabled={working}
            rows={2}
          />
        ) : (
          <>
            {!sourceLabel && (
              <span className="mobile-composer-prompt-label">
                Choose a contract to review
              </span>
            )}
            {sourceLabel && (
              <span className="contracts-selected-label">{sourceLabel}</span>
            )}
          </>
        )}
      </div>
      <div className="mobile-composer-tools mobile-composer-tools--minimal">
        <div className="composer-toolbar-start">
          {attachControl}
          {pasteToggle}
        </div>
        {agentSelector}
        <div className="mobile-composer-actions">{sendButton}</div>
      </div>
    </div>
  ) : (
    <div className="input-bar">
      {inputMode === "paste" ? (
        <textarea
          className="input-textarea"
          placeholder="Paste the contract text to review..."
          value={pastedText}
          onChange={e => setPastedText(e.target.value)}
          disabled={working}
          rows={3}
        />
      ) : sourceLabel ? (
        <div className="contracts-selected-bar">
          <span className="contracts-selected-label">{sourceLabel}</span>
          <button type="button" className="contracts-clear-source" onClick={clearSource}>Change</button>
        </div>
      ) : (
        <div className="contracts-selected-bar contracts-selected-bar--empty">
          <span className="contracts-selected-label">Choose a contract from Documents or upload a file</span>
        </div>
      )}
      <div className="composer-toolbar">
        <div className="composer-toolbar-start">
          {attachControl}
          {pasteToggle}
        </div>
        <div className="composer-toolbar-end">
          {agentSelector}
          {sendButton}
        </div>
      </div>
    </div>
  );

  if (isHome) {
    return (
      <div className="contracts-review-home">
        {homeComposer}
        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" style={{ display: "none" }} onChange={handleFileUpload} />
        {working && statusText && <p className="contract-review-status contracts-home-status">{statusText}</p>}
        {error && <p className="contract-review-error contracts-home-error">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="contract-review-field">
        <span className="contract-review-label">Reviewed by (optional)</span>
        {agentSelector}
      </div>

      <div className="contract-review-field">
        <span className="contract-review-label">Contract</span>
        <div className="contracts-modal-source">
          {attachControl}
          {pasteToggle}
          {(selectedDocId || uploadName) && (
            <span className="contracts-modal-source-name">
              {selectedDocId ? docCatalog[selectedDocId] : uploadName}
              <button type="button" onClick={clearSource}>Clear</button>
            </span>
          )}
        </div>
        {inputMode === "paste" && (
          <textarea
            className="contract-review-textarea"
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Paste contract text..."
            disabled={working}
            rows={5}
          />
        )}
        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" style={{ display: "none" }} onChange={handleFileUpload} />
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
        <button type="button" onClick={() => { void submit(); }} disabled={!canSend} className="app-modal-btn app-modal-btn--primary">
          {working ? "Reviewing..." : "Start review"}
        </button>
      </div>
    </>
  );
}
