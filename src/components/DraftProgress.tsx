"use client";

import { useState, type Dispatch, SetStateAction } from "react";
import { Check, Loader2, Clock, XCircle, ChevronDown } from "lucide-react";
import type { DraftClause } from "@/lib/draft";
import FrameworkRef from "@/components/FrameworkRef";

export type SectionPlanItem = {
  number:       string;
  title:        string;
  clause_count: number;
  state:        "pending" | "active" | "done";
  clauses?:     DraftClause[];
};

export type DraftPlan = {
  title:          string;
  agreement_type: string;
  parties:        { provider: string; customer: string };
  governing_law:  string;
  frameworks:     string[];
  summary:        string;
  drafting_notes: string[];
  sections:       SectionPlanItem[];
};

export type DraftActivityStep = {
  text:  string;
  state: "active" | "done" | "error";
};

export function handleDraftSSEEvent(
  event:    { type: string; [key: string]: unknown },
  setPlan:  Dispatch<SetStateAction<DraftPlan | null>>,
  setSteps: Dispatch<SetStateAction<DraftActivityStep[]>>,
) {
  switch (event.type) {
    case "step": {
      const { text, state } = event as { type: string; text: string; state: DraftActivityStep["state"] };
      setSteps(prev => {
        const cleared = state === "active"
          ? prev.map(s => s.state === "active" ? { ...s, state: "done" as const } : s)
          : prev;
        const idx = cleared.findLastIndex(s =>
          s.text === text || (state === "done" && s.text.startsWith(text.split("—")[0])),
        );
        if (idx >= 0) {
          const next = [...cleared];
          next[idx] = { text, state };
          return next;
        }
        return [...cleared, { text, state }];
      });
      break;
    }

    case "plan": {
      const { plan } = event as { type: string; plan: DraftPlan };
      setPlan(plan);
      break;
    }

    case "section_start": {
      const { section } = event as { type: string; section: { number: string; title: string } };
      setPlan(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map(s =>
            s.number === section.number ? { ...s, state: "active" } : s,
          ),
        };
      });
      break;
    }

    case "section_done": {
      const { section, clauses } = event as {
        type:    string;
        section: { number: string; title: string };
        clauses: DraftClause[];
      };
      setPlan(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map(s =>
            s.number === section.number ? { ...s, state: "done", clauses } : s,
          ),
        };
      });
      break;
    }
  }
}

function SectionRow({ section }: { section: SectionPlanItem }) {
  const [open, setOpen] = useState(false);
  const isDone = section.state === "done";
  const hasClauses = !!(section.clauses && section.clauses.length > 0);

  const head = (
    <>
      <div className="draft-progress-section-icon">
        {section.state === "done"    && <Check size={12} color="var(--rl, #3B6D11)" strokeWidth={2.5} />}
        {section.state === "active"  && <Loader2 size={12} color="var(--fg3)" className="spin" />}
        {section.state === "pending" && <Clock size={11} color="var(--fg4, #c8c0b8)" />}
      </div>
      <span className="draft-progress-section-number">{section.number}.</span>
      <span className={`draft-progress-section-title draft-progress-section-title--${section.state}`}>
        {section.title}
      </span>
      <span className="draft-progress-section-meta">
        {section.state === "done"
          ? `${section.clauses?.length ?? section.clause_count} clauses`
          : section.state === "active"
          ? "drafting..."
          : `~${section.clause_count} clauses`}
      </span>
      {isDone && hasClauses && (
        <ChevronDown
          size={13}
          color="var(--fg3)"
          className={`draft-progress-section-chevron${open ? " open" : ""}`}
          aria-hidden
        />
      )}
    </>
  );

  return (
    <div
      className="draft-progress-section"
      style={{ background: section.state === "active" ? "var(--lift)" : "transparent" }}
    >
      {isDone && hasClauses ? (
        <button
          type="button"
          className="draft-progress-section-head draft-progress-section-head--clickable"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
        >
          {head}
        </button>
      ) : (
        <div className="draft-progress-section-head">
          {head}
        </div>
      )}

      {isDone && open && hasClauses && (
        <div className="draft-progress-clauses">
          {section.clauses!.map(clause => (
            <div key={clause.number} className="draft-progress-clause">
              <span className="draft-progress-clause-number">{clause.number}</span>
              <div className="draft-progress-clause-body">
                <div className="draft-progress-clause-title">{clause.title}</div>
                <p className="draft-progress-clause-text draft-progress-clause-text--expanded">{clause.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DraftProgress({
  plan,
  steps,
  agentName,
  working,
}: {
  plan:      DraftPlan | null;
  steps:     DraftActivityStep[];
  agentName: string;
  working:   boolean;
}) {
  if (!steps.length && !plan) return null;

  const doneSections  = plan?.sections.filter(s => s.state === "done").length ?? 0;
  const totalSections = plan?.sections.length ?? 0;
  const totalClauses  = plan?.sections.reduce((n, s) => n + (s.clauses?.length ?? 0), 0) ?? 0;

  return (
    <div className="draft-progress-wrap">
      {steps.length > 0 && (
        <div className="contract-review-activity" aria-live="polite">
          <div className="contract-review-activity-head">
            {working && !plan ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
            <span>{agentName}</span>
          </div>
          <ul className="contract-review-activity-list">
            {steps.map((step, i) => (
              <li key={i} className={`contract-review-activity-step contract-review-activity-step--${step.state}`}>
                <span className="contract-review-activity-icon" aria-hidden="true">
                  {step.state === "done"   && <Check size={11} strokeWidth={2.5} />}
                  {step.state === "active" && <Loader2 size={11} className="spin" />}
                  {step.state === "error"  && <XCircle size={11} strokeWidth={2.5} />}
                </span>
                <span>{step.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan && (
        <div className="draft-progress-plan">
          <div className="draft-progress-plan-head">
            <div className="draft-progress-plan-title">{plan.title || plan.agreement_type}</div>
            <div className="draft-progress-plan-meta">
              <span>{plan.parties.provider} — {plan.parties.customer}</span>
              {plan.governing_law && <span>{plan.governing_law}</span>}
              <span className="draft-progress-plan-count">
                {working
                  ? `${doneSections} / ${totalSections} sections`
                  : `${totalSections} sections · ${totalClauses} clauses`}
              </span>
            </div>
          </div>

          {plan.frameworks?.length > 0 && (
            <div className="draft-progress-frameworks">
              {plan.frameworks.map((fw, i) => (
                <FrameworkRef key={i} label={fw} />
              ))}
            </div>
          )}

          <div>
            {plan.sections.map(section => (
              <SectionRow key={section.number} section={section} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
