import { DRAFT_AGREEMENT_TYPES } from "@/lib/draft";
import { JURISDICTION_CHIP_OPTIONS } from "@/lib/jurisdictions";

export type DraftQuestion = {
  id:        string;
  text:      string;
  sub?:      string;
  type:      "single" | "multi" | "text";
  options?:  { value: string; label: string }[];
  required?: boolean;
  optional?: boolean;
};

export type DraftAnswers = Record<string, string | string[]>;

export const DRAFT_QUESTIONS: DraftQuestion[] = [
  {
    id:       "agreement_type",
    required: true,
    text:     "What type of agreement do you need?",
    type:     "single",
    options:  DRAFT_AGREEMENT_TYPES.map(t => ({ value: t.value, label: t.label })),
  },
  {
    id:       "provider_name",
    required: true,
    text:     "Who is the provider / service company?",
    sub:      "e.g. Norvar Inc.",
    type:     "text",
  },
  {
    id:       "customer_name",
    required: true,
    text:     "Who is the customer / client?",
    sub:      "e.g. Acme Corp.",
    type:     "text",
  },
  {
    id:       "jurisdictions",
    text:     "Which jurisdictions should this agreement cover?",
    sub:      "Select all that apply.",
    type:     "multi",
    options:  JURISDICTION_CHIP_OPTIONS.map(j => ({ value: j, label: j })),
  },
  {
    id:       "context",
    optional: true,
    text:     "Any additional context?",
    sub:      "Optional — e.g. SaaS platform processing EU health data, BAA for a HIPAA-covered entity, AI model used for automated hiring decisions.",
    type:     "text",
  },
];

const QUESTION_BY_ID = Object.fromEntries(DRAFT_QUESTIONS.map(q => [q.id, q]));

export function nextDraftQuestion(answers: DraftAnswers): DraftQuestion | null {
  for (const q of DRAFT_QUESTIONS) {
    if (answers[q.id] !== undefined) continue;
    return q;
  }
  return null;
}

export function formatDraftQuestionText(question: DraftQuestion): string {
  return [question.text, question.sub].filter(Boolean).join("\n\n");
}

export function draftQuestionOptions(question: DraftQuestion): string[] | undefined {
  if (question.type === "text") {
    return question.optional ? ["Skip"] : undefined;
  }
  const labels = question.options?.map(o => o.label) ?? [];
  if (question.type === "multi") return [...labels, "Continue"];
  return labels;
}

export function labelForDraftAnswer(questionId: string, value: string): string {
  const q = QUESTION_BY_ID[questionId];
  return q?.options?.find(o => o.value === value)?.label ?? value;
}

export function compileDraftRequest(answers: DraftAnswers) {
  const typeValue = answers.agreement_type as string;
  const typeOpt   = DRAFT_AGREEMENT_TYPES.find(t => t.value === typeValue);
  return {
    agreement_type:       typeValue,
    agreement_type_label: typeOpt?.label ?? typeValue,
    provider_name:        String(answers.provider_name ?? "").trim() || "[Provider Name]",
    customer_name:        String(answers.customer_name ?? "").trim() || "[Customer Name]",
    jurisdictions:        Array.isArray(answers.jurisdictions) ? answers.jurisdictions : [],
    context:              String(answers.context ?? "").trim(),
  };
}
