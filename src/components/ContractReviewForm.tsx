"use client";

import { useEffect, useRef, useState } from "react";
import DocumentPicker, { SelectedDocumentChips } from "@/components/DocumentPicker";
import AgentComposer from "@/components/AgentComposer";
import RedlineModelSelector from "@/components/RedlineModelSelector";
import ContractReviewActivity, {
  appendActivityStep,
  completeAllActivity,
  createActivityStep,
  failActiveActivity,
  friendlyReviewError,
  markActiveDone,
  type ReviewActivityStep,
} from "@/components/ContractReviewActivity";
import { readSSEStream } from "@/lib/sse";
import type { RedlineOutput } from "@/lib/redline";
import {
  DEFAULT_REDLINE_REVIEW_MODEL,
  redlineModelLabel,
  type RedlineReviewModelChoice,
} from "@/lib/redline-models";

type InputMode = "document" | "upload" | "paste";

function formatCount(n: number) {
  return n.toLocaleString();
}

export default function ContractReviewForm({
  initialDocumentId,
  onDone,
  isMobileView = false,
  reviewModel: reviewModelProp,
  onReviewModelChange,
}: {
  initialDocumentId?: string | null;
  onDone:             () => void;
  isMobileView?:      boolean;
  reviewModel?:       RedlineReviewModelChoice;
  onReviewModelChange?: (value: RedlineReviewModelChoice) => void;
}) {
  const fileRef                     = useRef<HTMLInputElement>(null);
  const composerRef                 = useRef<HTMLTextAreaElement>(null);
  const [inputMode, setInputMode]   = useState<InputMode>("document");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialDocumentId ?? null);
  const [docCatalog, setDocCatalog] = useState<Record<string, string>>({});
  const [uploadName, setUploadName] = useState("");
  const [contractText, setContractText] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [reviewModelInternal, setReviewModelInternal] = useState<RedlineReviewModelChoice>(DEFAULT_REDLINE_REVIEW_MODEL);
  const reviewModel = reviewModelProp ?? reviewModelInternal;
  const setReviewModel = onReviewModelChange ?? setReviewModelInternal;
  const [jurisdictions, setJurisdictions] = useState("");
  const [activitySteps, setActivitySteps] = useState<ReviewActivityStep[]>([]);
  const [working, setWorking]       = useState(false);
  const [fileExtracting, setFileExtracting] = useState(false);
  const [error, setError]           = useState("");

  const modelLabel = redlineModelLabel(reviewModel);
  const showActivity = activitySteps.length > 0;

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

  const pushStatus = (text: string) => {
    setActivitySteps(prev => appendActivityStep(prev, text));
  };

  const pulseStatus = (text: string) => {
    setActivitySteps(prev => {
      const active = [...prev].reverse().find(step => step.state === "active");
      if (!active) return appendActivityStep(prev, text);
      return prev.map(step => step.id === active.id ? { ...step, text } : step);
    });
  };

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
    setActivitySteps([createActivityStep(`Reading ${f.name}...`)]);
    try {
      const text = await extractFileText(f);
      setContractText(text);
      setUploadName(f.name);
      setSelectedDocId(null);
      setInputMode("upload");
      setPastedText("");
      setActivitySteps(prev => [
        ...markActiveDone(prev),
        createActivityStep(
          `Extracted ${formatCount(text.length)} characters from ${f.name}.`,
          "done",
        ),
      ]);
    } catch (err: unknown) {
      setActivitySteps(prev => failActiveActivity(prev));
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
    setActivitySteps([]);
    setError("");
  };

  const canSend = working
    ? false
    : inputMode === "document"
    ? !!selectedDocId
    : inputMode === "paste"
    ? pastedText.trim().length >= 100
    : contractText.trim().length >= 100;

  const showSendButton = canSend || working;

  const submit = async () => {
    setError("");
    setWorking(true);
    setActivitySteps([createActivityStep(`Starting review with ${modelLabel}...`)]);

    try {
      const body: Record<string, unknown> = {
        review_model: reviewModel,
        jurisdictions: jurisdictions.split(",").map(j => j.trim()).filter(Boolean),
      };

      if (inputMode === "document") {
        if (!selectedDocId) {
          setError("Choose a contract from Documents.");
          setWorking(false);
          setActivitySteps([]);
          return;
        }
        body.document_id = selectedDocId;
        const docName = docCatalog[selectedDocId] ?? "your document";
        setActivitySteps(prev => appendActivityStep(prev, `Connecting to ${docName} in Documents...`));
      } else {
        const text = inputMode === "paste" ? pastedText.trim() : contractText.trim();
        if (text.length < 100) {
          setError("Please provide at least 100 characters of contract text.");
          setWorking(false);
          setActivitySteps([]);
          return;
        }
        body.contract_text = text;
        if (inputMode === "paste") {
          setActivitySteps(prev => appendActivityStep(
            prev,
            `Using ${formatCount(text.length)} characters from pasted text.`,
            "done",
          ));
        } else {
          setActivitySteps(prev => appendActivityStep(
            prev,
            `Using text extracted from ${uploadName} (${formatCount(text.length)} characters).`,
            "done",
          ));
        }
      }

      setActivitySteps(prev => appendActivityStep(prev, "Sending contract for review..."));

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
        if (event.type === "status") pushStatus(event.text ?? "");
        if (event.type === "pulse") pulseStatus(event.text ?? "");
        if (event.type === "done") redline = (event as { redline?: RedlineOutput }).redline ?? null;
        if (event.type === "error") throw new Error(event.text ?? "Redline failed");
      });

      if (!redline) throw new Error("No redline output received");

      setActivitySteps(prev => completeAllActivity(prev, "Opening your redline..."));
      onDone();
    } catch (e: unknown) {
      setActivitySteps(prev => failActiveActivity(prev));
      setError(friendlyReviewError(e));
    } finally {
      setWorking(false);
    }
  };

  const modelSelector = (
    <RedlineModelSelector
      value={reviewModel}
      onChange={setReviewModel}
      disabled={working || fileExtracting}
      menuPlacement="top"
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
          setActivitySteps([]);
          setError("");
        }
      }}
      disabled={working || fileExtracting}
      variant="icon"
      onUpload={() => fileRef.current?.click()}
      uploading={fileExtracting}
    />
  );

  const sourceLabel = inputMode === "document" && selectedDocId
    ? docCatalog[selectedDocId] ?? "Selected document"
    : inputMode === "upload" && uploadName
    ? uploadName
    : null;

  const hideComposerInput = !!sourceLabel;

  const handleComposerChange = (value: string) => {
    setPastedText(value);
    if (value.trim()) {
      setInputMode("paste");
      setSelectedDocId(null);
      setContractText("");
      setUploadName("");
      setActivitySteps([]);
      setError("");
    } else if (inputMode === "paste") {
      setInputMode("document");
    }
  };

  const activityPanel = showActivity && (
    <ContractReviewActivity
      agentName={modelLabel}
      steps={activitySteps}
      working={working || fileExtracting}
    />
  );

  const sourcePrompt = sourceLabel ? (
    <div className="contracts-selected-bar contracts-selected-bar--home">
      <span className="contracts-selected-label">{sourceLabel}</span>
      <button type="button" className="contracts-clear-source" onClick={clearSource} disabled={working || fileExtracting}>
        Change
      </button>
    </div>
  ) : undefined;

  return (
    <div className="contracts-review-home">
      <AgentComposer
        variant="home"
        mode="contracts"
        value={inputMode === "paste" ? pastedText : ""}
        onChange={handleComposerChange}
        inputRef={composerRef}
        placeholder="Paste contract text to review..."
        hideInput={hideComposerInput}
        loading={working || fileExtracting}
        canSend={canSend}
        onSend={() => { void submit(); }}
        showSendButton={showSendButton}
        attachControl={attachControl}
        modelControl={modelSelector}
        attachPlacement="end"
        promptOverride={sourcePrompt}
        sendAriaLabel="Start review"
        header={(selectedDocId || uploadName) ? (
          <div style={{ padding: isMobileView ? "0 0 8px" : "0 2px 8px" }}>
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
        ) : undefined}
      />
      <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" style={{ display: "none" }} onChange={handleFileUpload} />
      {activityPanel}
      {error && <p className="contract-review-error contracts-home-error">{error}</p>}
    </div>
  );
}
