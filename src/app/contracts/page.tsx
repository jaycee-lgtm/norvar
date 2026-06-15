"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Plus, Upload, Trash2, X, ArrowLeft,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import RedlineCard from "@/components/RedlineCard";
import AiDisclaimer from "@/components/AiDisclaimer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { readSSEStream } from "@/lib/sse";
import type { RedlineOutput } from "@/lib/redline";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";

type RedlineRecord = {
  id:             string;
  agent:          "cassius" | "nora";
  agreement_type: string;
  governing_law:  string;
  overall_status: RedlineOutput["overall_status"];
  result:         RedlineOutput;
  document_id:    string | null;
  created_at:     string;
};

function fmt_date(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmt_time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_META = {
  do_not_sign:        { label: "Do Not Sign",        color: "var(--rh)",  bg: "var(--rh-bg)",  icon: <XCircle size={11} /> },
  significant_issues: { label: "Significant Issues", color: "var(--rm)",  bg: "var(--rm-bg)",  icon: <AlertTriangle size={11} /> },
  needs_work:         { label: "Needs Work",          color: "var(--rl)",  bg: "var(--rl-bg)",  icon: <AlertTriangle size={11} /> },
  clean:              { label: "Clean",               color: "var(--fg3)", bg: "var(--card2)",  icon: <CheckCircle size={11} /> },
};

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "do_not_sign", label: "Do Not Sign" },
  { value: "significant_issues", label: "Significant Issues" },
  { value: "needs_work", label: "Needs Work" },
  { value: "clean", label: "Clean" },
] as const;

function UploadAndReviewModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone:  () => void;
}) {
  const fileRef                     = useRef<HTMLInputElement>(null);
  const [file, setFile]             = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [inputMode, setInputMode]   = useState<"upload" | "paste">("paste");
  const [agent, setAgent]           = useState<"cassius" | "nora">("nora");
  const [jurisdictions, setJurisdictions] = useState("");
  const [statusText, setStatusText] = useState("");
  const [working, setWorking]       = useState(false);
  const [error, setError]           = useState("");

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
      let contractText = pastedText.trim();

      if (inputMode === "upload") {
        if (!file) {
          setError("Choose a file or switch to paste.");
          setWorking(false);
          return;
        }
        setStatusText("Reading document...");
        contractText = await extractFileText(file);
      }

      if (contractText.length < 100) {
        setError("Please provide at least 100 characters of contract text.");
        setWorking(false);
        return;
      }

      setStatusText(`${agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name} is reviewing clauses...`);

      const jurs = jurisdictions.split(",").map(j => j.trim()).filter(Boolean);
      const res = await fetch("/api/redline", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ contract_text: contractText, agent, jurisdictions: jurs }),
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
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setWorking(false);
      setStatusText("");
    }
  };

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <div
        className="app-modal-panel"
        style={{ width: "min(520px, calc(100vw - 32px))", maxHeight: "min(90vh, calc(100dvh - 32px))" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>New contract review</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg3)" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
            Reviewed by
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["nora", "cassius"] as const).map(a => (
              <button key={a} type="button" onClick={() => setAgent(a)} disabled={working} style={{
                flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 500,
                border: `0.5px solid ${agent === a ? "var(--bdr3)" : "var(--bdr2)"}`,
                background: agent === a ? "var(--lift)" : "transparent",
                color: agent === a ? "var(--fg)" : "var(--fg3)",
                cursor: working ? "not-allowed" : "pointer", fontFamily: "'Sora', sans-serif",
              }}>
                <Shield size={11} style={{ marginRight: 5, verticalAlign: "middle" }} />
                {a === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
            Contract
          </label>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {(["upload", "paste"] as const).map(m => (
              <button key={m} type="button" onClick={() => setInputMode(m)} disabled={working} style={{
                padding: "5px 14px", borderRadius: 5, fontSize: 11, fontWeight: 500,
                border: `0.5px solid ${inputMode === m ? "var(--bdr3)" : "var(--bdr2)"}`,
                background: inputMode === m ? "var(--lift)" : "transparent",
                color: inputMode === m ? "var(--fg)" : "var(--fg3)",
                cursor: working ? "not-allowed" : "pointer", fontFamily: "'Sora', sans-serif",
                textTransform: "capitalize",
              }}>
                {m === "upload" ? "Upload file" : "Paste text"}
              </button>
            ))}
          </div>

          {inputMode === "upload" ? (
            <div
              onClick={() => !working && fileRef.current?.click()}
              style={{
                border: `1.5px dashed ${file ? "var(--bdr3)" : "var(--bdr2)"}`,
                borderRadius: 8, padding: "20px 16px", textAlign: "center",
                cursor: working ? "not-allowed" : "pointer",
                background: file ? "var(--lift)" : "transparent",
              }}
            >
              <Upload size={18} color="var(--fg3)" style={{ margin: "0 auto 6px" }} />
              {file
                ? <p style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500 }}>{file.name}</p>
                : <p style={{ fontSize: 12, color: "var(--fg3)" }}>PDF, DOCX, or TXT</p>}
              <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
            </div>
          ) : (
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder="Paste the full contract text here..."
              disabled={working}
              style={{
                width: "100%", height: 200, padding: "10px 12px",
                borderRadius: 8, border: "0.5px solid var(--bdr2)",
                background: "var(--card2)", color: "var(--fg)", fontSize: 12,
                fontFamily: "'Sora', sans-serif", resize: "vertical", lineHeight: 1.6,
              }}
            />
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Jurisdiction hints (optional)
          </label>
          <input
            value={jurisdictions}
            onChange={e => setJurisdictions(e.target.value)}
            disabled={working}
            placeholder="e.g. EU, UK, US"
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: "0.5px solid var(--bdr2)", background: "var(--card2)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
            }}
          />
        </div>

        {working && statusText && (
          <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 12 }}>{statusText}</p>
        )}
        {error && <p style={{ fontSize: 11, color: "var(--rh)", marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={working} style={{
            padding: "7px 16px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
            background: "transparent", color: "var(--fg2)", fontSize: 12, cursor: working ? "not-allowed" : "pointer",
          }}>
            Cancel
          </button>
          <button type="button" onClick={() => { void submit(); }} disabled={working} style={{
            padding: "7px 16px", borderRadius: 6, border: "none",
            background: "var(--fg)", color: "var(--bg)",
            fontSize: 12, fontWeight: 500, cursor: working ? "not-allowed" : "pointer", opacity: working ? 0.7 : 1,
          }}>
            {working ? "Reviewing..." : "Start review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryRow({
  record,
  active,
  onClick,
}: {
  record:  RedlineRecord;
  active:  boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[record.overall_status] ?? STATUS_META.needs_work;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left",
        padding: "10px 14px", cursor: "pointer",
        borderBottom: "0.5px solid var(--bdr)",
        background: active ? "var(--lift)" : "transparent",
        display: "flex", alignItems: "flex-start", gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
          {record.agreement_type || "Agreement"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 3,
            background: meta.bg, color: meta.color, fontWeight: 500,
            display: "inline-flex", alignItems: "center", gap: 3,
          }}>
            {meta.icon}{meta.label}
          </span>
          <span style={{ fontSize: 10, color: "var(--fg3)", textTransform: "capitalize" }}>{record.agent}</span>
          <span style={{ fontSize: 10, color: "var(--fg3)" }}>{fmt_date(record.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

export default function ContractsPage() {
  const isMobileView                = useIsMobile();
  const [records, setRecords]       = useState<RedlineRecord[]>([]);
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [showUpload, setShowUpload]   = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgent, setFilterAgent]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const recsRes = await fetch("/api/redlines");
    const { redlines } = await recsRes.json().catch(() => ({ redlines: [] }));
    setRecords((redlines ?? []) as RedlineRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDone = () => {
    void load().then(() => {
      fetch("/api/redlines?limit=1")
        .then(r => r.json())
        .then(({ redlines: r }: { redlines?: RedlineRecord[] }) => {
          if (r?.[0]) setActiveId(r[0].id);
        })
        .catch(() => {});
    });
  };

  const filtered = records.filter(r =>
    (!filterStatus || r.overall_status === filterStatus) &&
    (!filterAgent || r.agent === filterAgent),
  );

  const activeRecord = records.find(r => r.id === activeId);
  const showList = !isMobileView || !activeId;
  const showDetail = !isMobileView || !!activeId;

  const sidebarFilters = (
    <>
      <div className="sidebar-divider" />
      <div className="sidebar-section">Status</div>
      {STATUS_FILTERS.map(({ value, label }) => (
        <button
          key={value || "all"}
          type="button"
          onClick={() => setFilterStatus(value)}
          className={`sidebar-nav-item${filterStatus === value ? " active" : ""}`}
          style={{ width: "100%", textAlign: "left" }}
        >
          {label}
          {value ? (
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg3)" }}>
              {records.filter(r => r.overall_status === value).length}
            </span>
          ) : null}
        </button>
      ))}
      <div className="sidebar-divider" />
      <div className="sidebar-section">Agent</div>
      {(["nora", "cassius"] as const).map(a => (
        <button
          key={a}
          type="button"
          onClick={() => setFilterAgent(filterAgent === a ? "" : a)}
          className={`sidebar-nav-item${filterAgent === a ? " active" : ""}`}
          style={{ width: "100%", textAlign: "left", textTransform: "capitalize" }}
        >
          {a === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg3)" }}>
            {records.filter(r => r.agent === a).length}
          </span>
        </button>
      ))}
    </>
  );

  return (
    <AppShell sidebarExtra={sidebarFilters}>
      <main className="main-area contracts-page" style={{ display: "flex", flexDirection: "row", overflow: "hidden" }}>
        {showList && (
          <div className="contracts-history-panel" style={{
            width: isMobileView ? "100%" : 280,
            flexShrink: 0,
            borderRight: isMobileView ? "none" : "0.5px solid var(--bdr)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{
              padding: "14px 16px", borderBottom: "0.5px solid var(--bdr)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "var(--card)", flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>Contracts</span>
              <button type="button" onClick={() => setShowUpload(true)} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 5,
                background: "var(--fg)", color: "var(--bg)",
                border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer",
              }}>
                <Plus size={11} /> New
              </button>
            </div>

            <div style={{
              padding: "8px 16px", borderBottom: "0.5px solid var(--bdr)",
              display: "flex", gap: 16, background: "var(--card2)", flexShrink: 0,
            }}>
              {[
                { label: "Total", value: records.length },
                { label: "Issues", value: records.filter(r => r.overall_status === "do_not_sign" || r.overall_status === "significant_issues").length },
                { label: "Clean", value: records.filter(r => r.overall_status === "clean").length },
              ].map(({ label, value }) => (
                <div key={label} style={{ fontSize: 11, color: "var(--fg3)" }}>
                  <span style={{ fontWeight: 600, color: "var(--fg)", marginRight: 3 }}>{value}</span>{label}
                </div>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && (
                <div style={{ padding: "30px 16px", textAlign: "center", fontSize: 12, color: "var(--fg3)" }}>
                  Loading...
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div style={{ padding: "40px 16px", textAlign: "center" }}>
                  <Shield size={24} color="var(--fg4)" style={{ margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 12, color: "var(--fg3)" }}>
                    {records.length === 0 ? "No contracts reviewed yet" : "No contracts match this filter"}
                  </p>
                </div>
              )}
              {!loading && filtered.map(record => (
                <HistoryRow
                  key={record.id}
                  record={record}
                  active={activeId === record.id}
                  onClick={() => setActiveId(record.id)}
                />
              ))}
            </div>
          </div>
        )}

        {showDetail && (
          <div className="main-scroll" style={{ flex: 1 }}>
            {!activeRecord ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, padding: 24 }}>
                <Shield size={36} color="var(--fg4)" />
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 14, color: "var(--fg2)", fontWeight: 500, marginBottom: 6 }}>
                    No contract selected
                  </p>
                  <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 20 }}>
                    Select a review from the list or start a new one
                  </p>
                  <button type="button" onClick={() => setShowUpload(true)} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 6,
                    background: "var(--fg)", color: "var(--bg)",
                    border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}>
                    <Upload size={13} /> New contract review
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: isMobileView ? "16px 14px 32px" : "24px 32px", maxWidth: 760, margin: "0 auto" }}>
                {isMobileView && (
                  <button type="button" onClick={() => setActiveId(null)} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16,
                    padding: "6px 10px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
                    background: "transparent", color: "var(--fg2)", fontSize: 12, cursor: "pointer",
                  }}>
                    <ArrowLeft size={14} /> All reviews
                  </button>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1, fontSize: 11, color: "var(--fg3)" }}>
                    Reviewed by {activeRecord.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
                    {" · "}{fmt_date(activeRecord.created_at)} at {fmt_time(activeRecord.created_at)}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Delete this redline review?")) return;
                      await fetch("/api/redlines", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: activeRecord.id }),
                      });
                      setActiveId(null);
                      void load();
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 10px", borderRadius: 5, fontSize: 11,
                      border: "0.5px solid var(--bdr2)", background: "transparent",
                      color: "var(--fg3)", cursor: "pointer",
                    }}
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
                <RedlineCard redline={activeRecord.result} />
                <AiDisclaimer agentName={activeRecord.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name} />
              </div>
            )}
          </div>
        )}
      </main>

      {showUpload && (
        <UploadAndReviewModal onClose={() => setShowUpload(false)} onDone={handleDone} />
      )}
    </AppShell>
  );
}
