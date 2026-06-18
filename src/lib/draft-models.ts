import {
  resolveRedlineReviewModel,
  type RedlineReviewModelChoice,
  type ResolvedRedlineReviewModel,
} from "@/lib/redline-models";

export const DRAFT_AUTO_MODEL_TAGLINE =
  "Picks Gemini Flash or Sonnet based on agreement complexity";

export type DraftComplexityInput = {
  agreementType:  string;
  jurisdictions:  string[];
  context:        string;
  includeClauses?: string[];
};

export type DraftPlanMetrics = {
  sectionCount: number;
  totalClauses: number;
};

const COMPLEX_AGREEMENT_TYPES = new Set([
  "msa",
  "dpa",
  "ai_use",
  "baa",
  "data_share",
  "subproc",
  "saas",
  "isa",
]);

const SIMPLE_AGREEMENT_TYPES = new Set(["nda", "privacy", "terms"]);

const THOROUGH_DRAFT_CHOICES = new Set<RedlineReviewModelChoice>([
  "opus",
  "o3",
  "gemini-pro",
]);

export const THOROUGH_WORKFLOW_CHOICES = THOROUGH_DRAFT_CHOICES;

const COMPLEXITY_CONTEXT_RE =
  /hipaa|health|phi|medical|\bai\b|automated decision|cross-border|multi-jurisdiction|sub-processor|transfer mechanism/i;

/** Higher scores favour Sonnet over Gemini Flash. */
export function scoreDraftComplexity(
  input: DraftComplexityInput,
  planMetrics?: DraftPlanMetrics,
): number {
  let score = 0;

  if (COMPLEX_AGREEMENT_TYPES.has(input.agreementType)) score += 2;
  if (SIMPLE_AGREEMENT_TYPES.has(input.agreementType)) score -= 1;

  const jurisdictionCount = input.jurisdictions.length;
  if (jurisdictionCount >= 3) score += 2;
  else if (jurisdictionCount >= 2) score += 1;

  const contextLength = input.context.trim().length;
  if (contextLength > 1500) score += 2;
  else if (contextLength > 500) score += 1;

  if ((input.includeClauses?.length ?? 0) >= 3) score += 1;

  if (COMPLEXITY_CONTEXT_RE.test(input.context)) score += 1;

  if (planMetrics) {
    if (planMetrics.sectionCount >= 11) score += 1;
    if (planMetrics.totalClauses >= 45) score += 1;
  }

  return score;
}

function autoDraftChoice(score: number): Exclude<RedlineReviewModelChoice, "auto"> {
  return autoWorkflowModelChoice(score);
}

export function autoWorkflowModelChoice(
  score: number,
): Exclude<RedlineReviewModelChoice, "auto"> {
  return score >= 2 ? "sonnet" : "gemini-flash";
}

export type ResolvedDraftModels = ResolvedRedlineReviewModel & {
  complexityScore: number;
  planProvider:    ResolvedRedlineReviewModel["provider"];
  planModelId:     string;
  planDisplayName: string;
};

function withPlanRouting(
  resolved: ResolvedRedlineReviewModel,
  planResolved: ResolvedRedlineReviewModel,
  complexityScore: number,
): ResolvedDraftModels {
  return {
    ...resolved,
    complexityScore,
    planProvider:    planResolved.provider,
    planModelId:       planResolved.modelId,
    planDisplayName:   planResolved.displayName,
  };
}

/** Resolve Petra drafting models. Auto never selects Opus. */
export function resolveDraftReviewModel(
  choice: RedlineReviewModelChoice,
  input: DraftComplexityInput,
  planMetrics?: DraftPlanMetrics,
): ResolvedDraftModels {
  const complexityScore = scoreDraftComplexity(input, planMetrics);

  if (choice !== "auto") {
    const resolved = resolveRedlineReviewModel(choice, 0);
    const planResolved = THOROUGH_DRAFT_CHOICES.has(choice)
      ? resolveRedlineReviewModel("sonnet", 0)
      : resolved;
    return withPlanRouting(resolved, planResolved, complexityScore);
  }

  const autoChoice = autoDraftChoice(complexityScore);
  const resolved = resolveRedlineReviewModel(autoChoice, 0);
  const planResolved = resolveRedlineReviewModel(autoChoice, 0);

  return withPlanRouting(
    {
      ...resolved,
      choice:       "auto",
      displayName:  autoChoice === "gemini-flash" ? "Auto · Gemini Flash" : "Auto · Sonnet",
      activityName: "Auto",
      statusLead:   autoChoice === "gemini-flash"
        ? "Auto selected Gemini Flash for this agreement scope"
        : "Auto selected Sonnet for a complex agreement scope",
    },
    planResolved,
    complexityScore,
  );
}
