import {
  autoWorkflowModelChoice,
  scoreDraftComplexity,
  THOROUGH_WORKFLOW_CHOICES,
} from "@/lib/draft-models";
import {
  resolveRedlineReviewModel,
  type RedlineReviewModelChoice,
  type ResolvedRedlineReviewModel,
} from "@/lib/redline-models";

export const REVIEW_AUTO_MODEL_TAGLINE =
  "Picks Gemini Flash or Sonnet based on agreement complexity";

export type ReviewComplexityInput = {
  agreementType:     string;
  jurisdictions:     string[];
  contractCharCount: number;
  contractText?:     string;
};

function agreementTypeKey(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("nda") || lower.includes("non-disclosure") || lower.includes("confidentiality agreement")) {
    return "nda";
  }
  if (lower.includes("data processing") || lower === "dpa") return "dpa";
  if (lower.includes("master service")) return "msa";
  if (lower.includes("information security")) return "isa";
  if (lower.includes("ai use") || (lower.includes("artificial intelligence") && lower.includes("use"))) {
    return "ai_use";
  }
  if (lower.includes("data sharing") || lower.includes("data transfer")) return "data_share";
  if (lower.includes("business associate") || lower.includes("baa")) return "baa";
  if (lower.includes("sub-processor") || lower.includes("subprocessor")) return "subproc";
  if (lower.includes("saas") || lower.includes("subscription") || lower.includes("license")) return "saas";
  if (lower.includes("privacy policy")) return "privacy";
  if (lower.includes("terms of service") || lower.includes("terms and conditions")) return "terms";
  return "commercial";
}

export function scoreReviewComplexity(input: ReviewComplexityInput): number {
  const contextSample = input.contractText?.slice(0, 4000) ?? "";
  let score = scoreDraftComplexity({
    agreementType: agreementTypeKey(input.agreementType),
    jurisdictions: input.jurisdictions,
    context:         contextSample,
  });

  if (input.contractCharCount > 24_000) score += 2;
  else if (input.contractCharCount > 12_000) score += 1;

  return score;
}

export type ResolvedReviewModels = ResolvedRedlineReviewModel & {
  complexityScore: number;
};

/** Resolve Varro review models. Auto never selects Opus. */
export function resolveReviewReviewModel(
  choice: RedlineReviewModelChoice,
  input: ReviewComplexityInput,
): ResolvedReviewModels {
  const complexityScore = scoreReviewComplexity(input);

  if (choice !== "auto") {
    return {
      ...resolveRedlineReviewModel(choice, input.contractCharCount),
      complexityScore,
    };
  }

  const autoChoice = autoWorkflowModelChoice(complexityScore);
  const resolved = resolveRedlineReviewModel(autoChoice, 0);

  return {
    ...resolved,
    choice:       "auto",
    complexityScore,
    displayName:  autoChoice === "gemini-flash" ? "Auto · Gemini Flash" : "Auto · Sonnet",
    activityName: "Auto",
    statusLead:   autoChoice === "gemini-flash"
      ? "Auto selected Gemini Flash for this review"
      : "Auto selected Sonnet for a complex review",
  };
}

export { THOROUGH_WORKFLOW_CHOICES as THOROUGH_REVIEW_CHOICES };
