"use client";

import { Check, Loader2, XCircle } from "lucide-react";

export type ReviewActivityStep = {
  id:    string;
  text:  string;
  state: "active" | "done" | "error";
};

export function createActivityStep(text: string, state: ReviewActivityStep["state"] = "active"): ReviewActivityStep {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, state };
}

export function markActiveDone(steps: ReviewActivityStep[]): ReviewActivityStep[] {
  return steps.map(step => step.state === "active" ? { ...step, state: "done" } : step);
}

export function appendActivityStep(
  steps: ReviewActivityStep[],
  text: string,
  state: ReviewActivityStep["state"] = "active",
): ReviewActivityStep[] {
  return [...markActiveDone(steps), createActivityStep(text, state)];
}

export function completeAllActivity(steps: ReviewActivityStep[], finalText?: string): ReviewActivityStep[] {
  const done = markActiveDone(steps);
  if (!finalText) return done;
  return [...done, createActivityStep(finalText, "done")];
}

export function failActiveActivity(steps: ReviewActivityStep[]): ReviewActivityStep[] {
  return steps.map(step => step.state === "active" ? { ...step, state: "error" } : step);
}

export function friendlyReviewError(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong.";
  const msg = error.message.toLowerCase();
  if (
    msg.includes("network")
    || msg.includes("failed to fetch")
    || msg.includes("load failed")
    || msg.includes("networkerror")
  ) {
    return "Connection lost while reviewing. This can happen on long reviews — try again, or use a shorter document.";
  }
  return error.message;
}

export default function ContractReviewActivity({
  agentName,
  steps,
  working,
}: {
  agentName: string;
  steps:     ReviewActivityStep[];
  working:   boolean;
}) {
  if (!steps.length) return null;

  return (
    <div className="contract-review-activity" aria-live="polite">
      <div className="contract-review-activity-head">
        {working ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
        <span>{agentName}</span>
      </div>
      <ul className="contract-review-activity-list">
        {steps.map(step => (
          <li key={step.id} className={`contract-review-activity-step contract-review-activity-step--${step.state}`}>
            <span className="contract-review-activity-icon" aria-hidden="true">
              {step.state === "done" && <Check size={11} strokeWidth={2.5} />}
              {step.state === "active" && <Loader2 size={11} className="spin" />}
              {step.state === "error" && <XCircle size={11} strokeWidth={2.5} />}
            </span>
            <span>{step.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
