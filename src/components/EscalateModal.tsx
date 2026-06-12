"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { UserProfile } from "@/lib/clerk-users";

type EscalateModalProps = {
  itemId:    string;
  gapTitle:  string;
  onClose:   () => void;
  onDone:    () => void;
};

export default function EscalateModal({ itemId, gapTitle, onClose, onDone }: EscalateModalProps) {
  const [email, setEmail]       = useState("");
  const [role, setRole]         = useState("");
  const [question, setQuestion] = useState("");
  const [note, setNote]         = useState("");
  const [query, setQuery]       = useState("");
  const [members, setMembers]   = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoadingMembers(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const res  = await fetch(`/api/org/members?${params}`);
        const data = await res.json();
        setMembers(data.members ?? []);
      } catch {
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const pickMember = (member: UserProfile) => {
    setEmail(member.email);
    setQuery("");
  };

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Recipient email is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/remediation", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id: itemId,
          escalation_email:     trimmed,
          escalation_role:      role.trim() || undefined,
          escalation_question:  question.trim() || undefined,
          escalation_note:      note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Escalation failed");
      onDone();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = {
    fontSize: 10, fontWeight: 600, color: "var(--fg3)",
    textTransform: "uppercase" as const, letterSpacing: "0.08em",
    display: "block", marginBottom: 4,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div style={{
        background: "var(--card)", border: "0.5px solid var(--bdr2)",
        borderRadius: 12, padding: "24px 28px", width: 440, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>Escalate gap</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg3)" }}>
            <X size={15} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 16 }}>{gapTitle}</p>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Escalate to (email)</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="reviewer@company.com"
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: "0.5px solid var(--bdr2)", background: "var(--card2)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Search org members</label>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 10, top: 10, color: "var(--fg3)" }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Name or email..."
              style={{
                width: "100%", padding: "8px 10px 8px 28px", borderRadius: 6,
                border: "0.5px solid var(--bdr2)", background: "var(--card2)",
                color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
              }}
            />
          </div>
          {loadingMembers && (
            <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <Loader2 size={11} className="spin" /> Searching...
            </div>
          )}
          {members.length > 0 && (
            <div style={{ marginTop: 6, border: "0.5px solid var(--bdr2)", borderRadius: 6, overflow: "hidden" }}>
              {members.slice(0, 5).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickMember(m)}
                  style={{
                    width: "100%", textAlign: "left", padding: "7px 10px",
                    border: "none", borderBottom: "0.5px solid var(--bdr)",
                    background: "transparent", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--fg)" }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: "var(--fg3)" }}>{m.email}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Their role</label>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="e.g. General Counsel, CISO, Compliance lead"
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: "0.5px solid var(--bdr2)", background: "var(--card2)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Question for reviewer</label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="What do you need them to decide or clarify?"
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: "0.5px solid var(--bdr2)", background: "var(--card2)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
              resize: "vertical", minHeight: 56,
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Additional context (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Background for the escalation..."
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: "0.5px solid var(--bdr2)", background: "var(--card2)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
              resize: "vertical", minHeight: 56,
            }}
          />
        </div>

        {error && <p style={{ fontSize: 11, color: "var(--rh)", marginBottom: 10 }}>{error}</p>}

        <p style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 14 }}>
          The recipient receives an email with the gap, your question, and a link to the full assessment and remediation chat.
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{
            padding: "7px 16px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
            background: "transparent", color: "var(--fg2)", fontSize: 12, cursor: "pointer",
          }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} style={{
            padding: "7px 16px", borderRadius: 6, border: "none",
            background: "var(--fg)", color: "var(--bg)",
            fontSize: 12, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer",
          }}>
            {saving ? "Escalating..." : "Escalate & notify"}
          </button>
        </div>
      </div>
    </div>
  );
}
