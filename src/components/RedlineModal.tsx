"use client";

import { useState } from "react";
import { X, Loader2, ShieldAlert } from "lucide-react";
import RedlineCard from "@/components/RedlineCard";
import { readSSEStream } from "@/lib/sse";
import type { RedlineOutput } from "@/lib/redline";
import AiDisclaimer from "@/components/AiDisclaimer";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";

export default function RedlineModal({
  documentId,
  documentName,
  onClose,
}: {
  documentId:   string;
  documentName: string;
  onClose:      () => void;
}) {
  const [agent, setAgent]       = useState<"nora" | "cassius">("nora");
  const [status, setStatus]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [redline, setRedline]   = useState<RedlineOutput | null>(null);

  const runRedline = async () => {
    setLoading(true);
    setError("");
    setStatus("");
    setRedline(null);

    try {
      const res = await fetch("/api/redline", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ document_id: documentId, agent }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Redline failed");
      }

      await readSSEStream(res, event => {
        if (event.type === "status") {
          setStatus(event.text ?? "");
        } else if (event.type === "done") {
          const result = (event as { redline?: RedlineOutput }).redline;
          if (result) setRedline(result);
        } else if (event.type === "error") {
          throw new Error(event.text ?? "Redline failed");
        }
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Redline failed");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const agentName = agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name;

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <div
        className="app-modal-panel"
        style={{ width: "min(720px, calc(100vw - 32px))", maxHeight: "min(90vh, calc(100dvh - 32px))" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <ShieldAlert size={14} color="var(--fg3)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>Agreement redline</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--fg3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {documentName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg3)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {!redline && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 8 }}>Review with</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["nora", "cassius"] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAgent(value)}
                  style={{
                    padding: "6px 12px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                    fontFamily: "'Sora', sans-serif",
                    border: `0.5px solid ${agent === value ? "var(--red)" : "var(--bdr2)"}`,
                    background: agent === value ? "rgba(139,26,26,0.09)" : "var(--card2)",
                    color: agent === value ? "var(--fg)" : "var(--fg3)",
                  }}
                >
                  {value === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "24px 0", color: "var(--fg3)", fontSize: 12 }}>
            <Loader2 size={14} className="spin" />
            {status || `${agentName} is reviewing clauses...`}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: "var(--rh)", marginBottom: 12 }}>{error}</p>
        )}

        {redline && (
          <div style={{ overflowY: "auto", maxHeight: "calc(90dvh - 180px)", paddingRight: 4 }}>
            <RedlineCard redline={redline} />
            <AiDisclaimer agentName={redline.redline_by === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name} />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, paddingTop: 12, borderTop: "0.5px solid var(--bdr)" }}>
          <button type="button" onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
            background: "transparent", color: "var(--fg2)", fontSize: 12, cursor: "pointer",
            fontFamily: "'Sora', sans-serif",
          }}>
            Close
          </button>
          {!loading && (
            <button type="button" onClick={() => { void runRedline(); }} style={{
              padding: "8px 14px", borderRadius: 6, border: "none",
              background: "var(--fg)", color: "var(--bg)", fontSize: 12, cursor: "pointer",
              fontFamily: "'Sora', sans-serif", fontWeight: 500,
            }}>
              {redline ? "Run again" : "Start review"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
