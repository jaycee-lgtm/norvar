"use client";

import { useState, type CSSProperties } from "react";
import { User, UserPlus, X, ArrowRightLeft } from "lucide-react";
import type { UserProfile } from "@/lib/clerk-users";

type AssigneeManagerProps = {
  itemId:       string;
  assignedTo:   string[];
  profiles:     Record<string, UserProfile>;
  onUpdate:     () => void;
};

export default function AssigneeManager({ itemId, assignedTo, profiles, onUpdate }: AssigneeManagerProps) {
  const [mode, setMode]       = useState<"idle" | "add" | "reassign">("idle");
  const [email, setEmail]     = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/remediation", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: itemId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setEmail("");
      setMode("idle");
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const remove = (uid: string) => {
    if (assignedTo.length <= 1) {
      setError("At least one assignee is required. Add someone else first, or use Reassign.");
      return;
    }
    patch({ remove_assignee: uid });
  };

  const addPerson = () => patch({ add_assignee_email: email });

  const reassign = () => patch({ reassign_email: email });

  const label = (uid: string) => profiles[uid]?.name ?? "Unknown user";

  return (
    <div onClick={e => e.stopPropagation()}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8, gap: 8, flexWrap: "wrap",
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, color: "var(--fg3)",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          Assigned to ({assignedTo.length})
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setMode(m => m === "add" ? "idle" : "add"); setError(""); }}
            style={actionBtnStyle}
          >
            <UserPlus size={10} /> Add
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setMode(m => m === "reassign" ? "idle" : "reassign"); setError(""); }}
            style={actionBtnStyle}
          >
            <ArrowRightLeft size={10} /> Reassign
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: mode !== "idle" ? 10 : 0 }}>
        {assignedTo.map(uid => (
          <span key={uid} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, padding: "3px 8px 3px 6px", borderRadius: 20,
            background: "var(--card2)", color: "var(--fg2)", border: "0.5px solid var(--bdr2)",
          }}>
            <User size={9} />
            {label(uid)}
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(uid)}
              title="Remove assignee"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none", cursor: busy ? "not-allowed" : "pointer",
                padding: 0, color: "var(--fg3)", marginLeft: 2,
              }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      {mode !== "idle" && (
        <div style={{
          display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          padding: "8px 10px", borderRadius: 6,
          border: "0.5px solid var(--bdr2)", background: "var(--card2)",
        }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Colleague's email address"
            disabled={busy}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (mode === "add") addPerson();
                else reassign();
              }
            }}
            style={{
              flex: 1, minWidth: 160, padding: "6px 8px", borderRadius: 5,
              border: "0.5px solid var(--bdr2)", background: "var(--card)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
            }}
          />
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={mode === "add" ? addPerson : reassign}
            style={{
              padding: "6px 12px", borderRadius: 5, fontSize: 11, fontWeight: 500,
              border: "none", background: "var(--fg)", color: "var(--bg)",
              cursor: busy || !email.trim() ? "not-allowed" : "pointer",
              fontFamily: "'Sora', sans-serif", opacity: busy || !email.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Saving..." : mode === "add" ? "Add person" : "Reassign all"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setMode("idle"); setEmail(""); setError(""); }}
            style={{
              padding: "6px 10px", borderRadius: 5, fontSize: 11,
              border: "0.5px solid var(--bdr2)", background: "transparent",
              color: "var(--fg3)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {mode === "reassign" && (
        <p style={{ fontSize: 10, color: "var(--fg3)", marginTop: 6, lineHeight: 1.45 }}>
          Reassign replaces all current assignees with one person.
        </p>
      )}

      {error && <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

const actionBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 500,
  border: "0.5px solid var(--bdr2)", background: "transparent",
  color: "var(--fg3)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
};
