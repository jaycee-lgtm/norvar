"use client";

import { useSampleQuestions } from "@/hooks/useSampleQuestions";
import type { SampleQuestionGap } from "@/lib/sample-questions-generate";

type AssessmentFollowUpChipsProps = {
  assessmentTitle?: string;
  gaps?:            SampleQuestionGap[];
  disabled?:        boolean;
  onSelect:         (question: string) => void;
};

export default function AssessmentFollowUpChips({
  assessmentTitle,
  gaps,
  disabled,
  onSelect,
}: AssessmentFollowUpChipsProps) {
  const { questions } = useSampleQuestions("assessment-followup", {
    enabled: !!gaps?.length,
    payload: { gaps, assessmentTitle },
  });

  if (!gaps?.length || questions.length === 0) return null;

  return (
    <div className="nora-follow-ups">
      {questions.map((q, i) => (
        <button
          key={`${i}-${q.slice(0, 24)}`}
          type="button"
          className="chip nora-follow-up-chip"
          disabled={disabled}
          onClick={() => { onSelect(q); }}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
