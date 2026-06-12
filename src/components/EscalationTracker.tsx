"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, Clock, User } from "lucide-react";
import {
  ESCALATION_STEPS,
  escalationStepIndex,
  formatDuration,
  type AssigneeMeta,
  type EscalationStatus,
} from "@/lib/escalation";
import type { UserProfile } from "@/lib/clerk-users";

type EscalationTrackerProps = {
  itemId:                   string;
  assignedTo:               string[];
  profiles:                 Record<string, UserProfile>;
  assigneeMeta?:            AssigneeMeta | null;
  escalationEmail?:         string | null;
  escalationRecipientName?: string | null;
  escalationRole?:          string | null;
  escalationQuestion?:      string | null;
  escalationNote?:          string | null;
  escalatedAt?:             string | null;
  escalationStatus?:        EscalationStatus | null;
  lastNotifiedAt?:          string | null;
  onUpdate:                 () => void;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function EscalationTracker({
  itemId,
  assignedTo,
  profiles,
  assigneeMeta,
  escalationEmail,
  escalationRecipientName,
  escalationRole,
  escalationQuestion,
  escalationNote,
  escalatedAt,
  escalationStatus,
  lastNotifiedAt,
  onUpdate,
}: EscalationTrackerProps) {
  const [renotifyBusy, setRenotifyBusy] = useState(false);
  const [statusBusy, setStatusBusy]     = useState(false);
  const [error, setError]               = useState("");

  const currentStep = escalationStepIndex(escalationStatus ?? undefined);
  const meta        = assigneeMeta ?? {};

  const renotify = async () => {
    setRenotifyBusy(true);
    setError("");
    try {
      const res = await fetch("/api/remediation", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: itemId, renotify: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send reminder");
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not send reminder");
    } finally {
      setRenotifyBusy(false);
    }
  };

  const setStatus = async (status: EscalationStatus) => {
    setStatusBusy(true);
    setError("");
    try {
      const res = await fetch("/api/remediation", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: itemId, escalation_status: status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update escalation");
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update escalation");
    } finally {
      setStatusBusy(false);
    }
  };

  if (!escalationEmail && assignedTo.length === 0) return null;

  return (
    <div style={{
      marginBottom: 12, padding: "12px 14px",
      background: "var(--card2)", border: "0.5px solid var(--bdr2)", borderRadius: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        Escalation tracking
      </div>

      {assignedTo.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--fg2)", marginBottom: 6 }}>Gap owners</div>
          {assignedTo.map(id => {
            const profile = profiles[id];
            const entry   = meta[id];
            const since   = entry?.since ?? null;
            return (
              <div key={id} style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                padding: "8px 0", borderBottom: "0.5px solid var(--bdr)",
              }}>
                <User size={12} color="var(--fg3)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>
                    {profile?.name ?? "Assignee"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 2 }}>
                    {entry?.role || "Role not set"}
                    {since && (
                      <> · held {formatDuration(since)} (since {fmtDate(since)})</>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: 10, color: "var(--fg4)", marginTop: 8, marginBottom: 0, fontFamily: "'Sora', sans-serif" }}>
            Roles are managed in{" "}
            <Link href="/settings" style={{ color: "var(--fg2)", textDecoration: "underline" }}>
              Settings
            </Link>
            .
          </p>
        </div>
      )}

      {escalationEmail && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--fg2)", marginBottom: 6 }}>Escalated to</div>
            <div style={{ fontSize: 12, color: "var(--fg)" }}>
              {escalationRecipientName ?? escalationEmail}
            </div>
            <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 2 }}>
              {escalationEmail}
              {escalationRole && <> · {escalationRole}</>}
            </div>
            {escalatedAt && (
              <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={10} />
                Escalated {formatDuration(escalatedAt)} ago · {fmtDate(escalatedAt)}
              </div>
            )}
            {lastNotifiedAt && (
              <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 2 }}>
                Last notified: {fmtDate(lastNotifiedAt)}
              </div>
            )}
          </div>

          {(escalationQuestion || escalationNote) && (
            <div style={{ marginBottom: 10, fontSize: 11, color: "var(--fg2)", lineHeight: 1.5 }}>
              {escalationQuestion && <p style={{ margin: "0 0 4px" }}><strong>Question:</strong> {escalationQuestion}</p>}
              {escalationNote && <p style={{ margin: 0 }}><strong>Context:</strong> {escalationNote}</p>}
            </div>
          )}

          <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
            {ESCALATION_STEPS.map((step, i) => {
              const done    = currentStep >= i;
              const current = currentStep === i;
              return (
                <div
                  key={step.value}
                  style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 4,
                    background: current ? "var(--rm-bg)" : done ? "var(--rl-bg)" : "var(--card)",
                    color:      current ? "var(--rm)" : done ? "var(--rl)" : "var(--fg3)",
                    border: `0.5px solid ${current ? "var(--rm-bdr)" : done ? "var(--rl-bdr)" : "var(--bdr2)"}`,
                  }}
                >
                  {step.label}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={renotify}
              disabled={renotifyBusy}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "5px 10px", borderRadius: 5, fontSize: 11,
                border: "0.5px solid var(--bdr2)", background: "var(--card)",
                color: "var(--fg2)", cursor: renotifyBusy ? "not-allowed" : "pointer",
                fontFamily: "'Sora', sans-serif",
              }}
            >
              <Bell size={10} />
              {renotifyBusy ? "Sending..." : "Renotify"}
            </button>
            {escalationStatus !== "closed" && (
              <>
                <button type="button" disabled={statusBusy} onClick={() => setStatus("in_review")} style={actionBtnStyle}>
                  Mark in review
                </button>
                <button type="button" disabled={statusBusy} onClick={() => setStatus("closed")} style={actionBtnStyle}>
                  Close escalation
                </button>
              </>
            )}
          </div>
        </>
      )}

      {error && (
        <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 8, marginBottom: 0 }}>{error}</p>
      )}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 5, fontSize: 11,
  border: "0.5px solid var(--bdr2)", background: "transparent",
  color: "var(--fg3)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
};
