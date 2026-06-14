"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, Trash2 } from "lucide-react";
import type { UserProfile } from "@/lib/clerk-users";
import {
  checklistProgress,
  type RemediationStepItem,
} from "@/lib/remediation-steps";

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day:    "numeric",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  itemId:            string;
  initialChecklist:  RemediationStepItem[];
  profiles:          Record<string, UserProfile>;
  onUpdate:          () => void;
};

export default function RemediationStepChecklist({
  itemId,
  initialChecklist,
  profiles,
  onUpdate,
}: Props) {
  const [checklist, setChecklist] = useState(initialChecklist);
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [error, setError]         = useState("");

  useEffect(() => {
    setChecklist(initialChecklist);
  }, [initialChecklist]);

  const { done, total } = checklistProgress(checklist);
  const hasChecklist    = total > 0;

  const toggleStep = async (step: RemediationStepItem) => {
    if (busyId) return;
    const completed = !step.completed_at;
    setBusyId(step.id);
    setError("");
    try {
      const res = await fetch("/api/remediation", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id:             itemId,
          step_id:        step.id,
          step_completed: completed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update step");
      if (Array.isArray(data.item?.step_checklist)) {
        setChecklist(data.item.step_checklist);
      }
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update step");
    } finally {
      setBusyId(null);
    }
  };

  const deleteStep = async (step: RemediationStepItem) => {
    if (busyId) return;
    setBusyId(step.id);
    setError("");
    try {
      const res = await fetch("/api/remediation", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id:             itemId,
          delete_step_id: step.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove step");
      if (Array.isArray(data.item?.step_checklist)) {
        setChecklist(data.item.step_checklist);
      }
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not remove step");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="remediation-detail-section">
      <div className="remediation-checklist-head">
        <div className="remediation-section-label">Remediation steps</div>
        {hasChecklist && (
          <span className="remediation-checklist-progress">
            {done} of {total} complete
          </span>
        )}
      </div>

      {!hasChecklist && (
        <p className="remediation-body-text remediation-checklist-empty">
          Ask Nora what you should do, then add steps from the advice below.
        </p>
      )}

      {hasChecklist && (
        <ul className="remediation-checklist">
          {checklist.map(step => {
            const isDone = Boolean(step.completed_at);
            const busy   = busyId === step.id;
            const who    = step.completed_by ? profiles[step.completed_by]?.name ?? "Team member" : null;

            return (
              <li key={step.id} className={`remediation-checklist-item${isDone ? " done" : ""}`}>
                <div className="remediation-checklist-row">
                  <button
                    type="button"
                    className="remediation-checklist-toggle"
                    disabled={Boolean(busyId)}
                    aria-pressed={isDone}
                    onClick={e => { e.stopPropagation(); void toggleStep(step); }}
                  >
                    {busy ? (
                      <Loader2 size={14} className="spin remediation-checklist-icon" />
                    ) : isDone ? (
                      <CheckCircle2 size={14} className="remediation-checklist-icon done" />
                    ) : (
                      <Circle size={14} className="remediation-checklist-icon" />
                    )}
                    <span className="remediation-checklist-text">{step.text}</span>
                  </button>
                  <button
                    type="button"
                    className="remediation-checklist-delete"
                    disabled={Boolean(busyId)}
                    title="Remove step"
                    aria-label="Remove step"
                    onClick={e => { e.stopPropagation(); void deleteStep(step); }}
                  >
                    {busy ? (
                      <Loader2 size={12} className="spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
                {isDone && step.completed_at && (
                  <div className="remediation-checklist-meta">
                    Completed {fmtWhen(step.completed_at)}
                    {who ? ` · ${who}` : ""}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="remediation-inline-error">{error}</p>}
    </section>
  );
}
