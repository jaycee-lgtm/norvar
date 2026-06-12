"use client";

import { useState } from "react";
import { Bell, Clock } from "lucide-react";
import {
  ESCALATION_STEPS,
  escalationStepIndex,
  formatDuration,
  type EscalationStatus,
} from "@/lib/escalation";

type EscalationTrackerProps = {
  itemId:                   string;
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

  if (!escalationEmail) return null;

  return (
    <section className="remediation-detail-section remediation-escalation">
      <div className="remediation-section-label">Escalation</div>

      <div className="remediation-escalation-target">
        <div className="remediation-escalation-name">
          {escalationRecipientName ?? escalationEmail}
        </div>
        <div className="remediation-escalation-meta">
          {escalationEmail}
          {escalationRole && <> · {escalationRole}</>}
        </div>
        {escalatedAt && (
          <div className="remediation-escalation-meta">
            Escalated {formatDuration(escalatedAt)} ago · {fmtDate(escalatedAt)}
          </div>
        )}
        {lastNotifiedAt && (
          <div className="remediation-escalation-meta">
            Last notified {fmtDate(lastNotifiedAt)}
          </div>
        )}
      </div>

      {(escalationQuestion || escalationNote) && (
        <div className="remediation-escalation-context">
          {escalationQuestion && <p><strong>Question:</strong> {escalationQuestion}</p>}
          {escalationNote && <p><strong>Context:</strong> {escalationNote}</p>}
        </div>
      )}

      <div className="remediation-escalation-steps">
        {ESCALATION_STEPS.map((step, i) => {
          const done    = currentStep >= i;
          const current = currentStep === i;
          return (
            <span
              key={step.value}
              className={`remediation-escalation-step${current ? " current" : ""}${done ? " done" : ""}`}
            >
              {step.label}
            </span>
          );
        })}
      </div>

      <div className="remediation-escalation-actions">
        <button
          type="button"
          onClick={renotify}
          disabled={renotifyBusy}
          className="remediation-action-btn"
        >
          <Bell size={10} />
          {renotifyBusy ? "Sending..." : "Renotify"}
        </button>
        {escalationStatus !== "closed" && (
          <>
            <button type="button" disabled={statusBusy} onClick={() => setStatus("in_review")} className="remediation-action-btn subtle">
              Mark in review
            </button>
            <button type="button" disabled={statusBusy} onClick={() => setStatus("closed")} className="remediation-action-btn subtle">
              Close escalation
            </button>
          </>
        )}
      </div>

      {error && <p className="remediation-inline-error">{error}</p>}
    </section>
  );
}
