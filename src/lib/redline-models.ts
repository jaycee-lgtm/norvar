export type RedlineReviewModelChoice =
  | "auto"
  | "sonnet"
  | "opus"
  | "gpt-4.1"
  | "o3"
  | "gemini-flash"
  | "gemini-pro";

export type RedlineModelGroup = "balanced" | "claude" | "openai" | "google";

export const REDLINE_MODEL_GROUPS: { id: RedlineModelGroup; label: string }[] = [
  { id: "balanced", label: "Recommended" },
  { id: "claude",   label: "Claude" },
  { id: "openai",   label: "OpenAI" },
  { id: "google",   label: "Google" },
];

export const REDLINE_REVIEW_MODELS: {
  id:       RedlineReviewModelChoice;
  label:    string;
  badge:    string;
  tagline:  string;
  group:    RedlineModelGroup;
}[] = [
  {
    id:      "auto",
    label:   "Auto",
    badge:   "",
    tagline: "Picks speed or depth based on document size",
    group:   "balanced",
  },
  {
    id:      "sonnet",
    label:   "Sonnet",
    badge:   "Fast",
    tagline: "Quicker reviews with strong quality",
    group:   "claude",
  },
  {
    id:      "opus",
    label:   "Opus",
    badge:   "Thorough",
    tagline: "Deepest Claude review — best for short agreements",
    group:   "claude",
  },
  {
    id:      "gpt-4.1",
    label:   "GPT-4.1",
    badge:   "Fast",
    tagline: "OpenAI's fast flagship — strong general reasoning",
    group:   "openai",
  },
  {
    id:      "o3",
    label:   "o3",
    badge:   "Thorough",
    tagline: "OpenAI reasoning model — deepest GPT review",
    group:   "openai",
  },
  {
    id:      "gemini-flash",
    label:   "Gemini Flash",
    badge:   "Fast",
    tagline: "Google's fast model — efficient on long agreements",
    group:   "google",
  },
  {
    id:      "gemini-pro",
    label:   "Gemini Pro",
    badge:   "Thorough",
    tagline: "Google's flagship — detailed clause analysis",
    group:   "google",
  },
];

export const DEFAULT_REDLINE_REVIEW_MODEL: RedlineReviewModelChoice = "auto";

const SONNET_MODEL       = "claude-sonnet-4-6";
const OPUS_MODEL         = "claude-opus-4-6";
const GPT_FAST_MODEL     = "gpt-4.1";
const GPT_THOROUGH_MODEL = "o3";
const GEMINI_FAST_MODEL  = "gemini-2.5-flash";
const GEMINI_PRO_MODEL   = "gemini-2.5-pro";

export type RedlineProvider = "anthropic" | "openai" | "google";

export type ResolvedRedlineReviewModel = {
  choice:         RedlineReviewModelChoice;
  provider:       RedlineProvider;
  modelId:        string;
  repairProvider: "anthropic";
  repairModelId:  string;
  maxTokens:      number;
  agent:          "nora" | "cassius";
  displayName:    string;
  activityName:   string;
  statusLead:     string;
};

const VALID_CHOICES = new Set<RedlineReviewModelChoice>(
  REDLINE_REVIEW_MODELS.map(m => m.id),
);

export function normalizeRedlineReviewModelChoice(
  value: unknown,
): RedlineReviewModelChoice {
  if (typeof value === "string" && VALID_CHOICES.has(value as RedlineReviewModelChoice)) {
    return value as RedlineReviewModelChoice;
  }
  return DEFAULT_REDLINE_REVIEW_MODEL;
}

/**
 * Auto mode:
 * - Documents > 12,000 chars → Claude Sonnet (fast, reliable on long agreements)
 * - Documents ≤ 12,000 chars → Claude Opus (deepest Claude pass for focused reviews)
 * Users can explicitly pick GPT or Gemini models for provider-specific quality.
 */
const AUTO_OPUS_CHAR_LIMIT = 12_000;

type ModelSpec = Omit<ResolvedRedlineReviewModel, "choice">;

const MODEL_SPECS: Record<Exclude<RedlineReviewModelChoice, "auto">, ModelSpec> = {
  sonnet: {
    provider:       "anthropic",
    modelId:        SONNET_MODEL,
    repairProvider: "anthropic",
    repairModelId:  SONNET_MODEL,
    maxTokens:      12_000,
    agent:          "nora",
    displayName:    "Sonnet",
    activityName:   "Sonnet",
    statusLead:     "Sonnet is reviewing clauses against Norvar's regulatory corpus",
  },
  opus: {
    provider:       "anthropic",
    modelId:        OPUS_MODEL,
    repairProvider: "anthropic",
    repairModelId:  SONNET_MODEL,
    maxTokens:      16_000,
    agent:          "cassius",
    displayName:    "Opus",
    activityName:   "Opus",
    statusLead:     "Opus is reviewing clauses against Norvar's regulatory corpus",
  },
  "gpt-4.1": {
    provider:       "openai",
    modelId:        GPT_FAST_MODEL,
    repairProvider: "anthropic",
    repairModelId:  SONNET_MODEL,
    maxTokens:      12_000,
    agent:          "nora",
    displayName:    "GPT-4.1",
    activityName:   "GPT-4.1",
    statusLead:     "GPT-4.1 is reviewing clauses against Norvar's regulatory corpus",
  },
  o3: {
    provider:       "openai",
    modelId:        GPT_THOROUGH_MODEL,
    repairProvider: "anthropic",
    repairModelId:  SONNET_MODEL,
    maxTokens:      16_000,
    agent:          "cassius",
    displayName:    "o3",
    activityName:   "o3",
    statusLead:     "o3 is reviewing clauses against Norvar's regulatory corpus",
  },
  "gemini-flash": {
    provider:       "google",
    modelId:        GEMINI_FAST_MODEL,
    repairProvider: "anthropic",
    repairModelId:  SONNET_MODEL,
    maxTokens:      12_000,
    agent:          "nora",
    displayName:    "Gemini Flash",
    activityName:   "Gemini Flash",
    statusLead:     "Gemini Flash is reviewing clauses against Norvar's regulatory corpus",
  },
  "gemini-pro": {
    provider:       "google",
    modelId:        GEMINI_PRO_MODEL,
    repairProvider: "anthropic",
    repairModelId:  SONNET_MODEL,
    maxTokens:      16_000,
    agent:          "cassius",
    displayName:    "Gemini Pro",
    activityName:   "Gemini Pro",
    statusLead:     "Gemini Pro is reviewing clauses against Norvar's regulatory corpus",
  },
};

function withChoice(
  choice: RedlineReviewModelChoice,
  spec: ModelSpec,
): ResolvedRedlineReviewModel {
  return { choice, ...spec };
}

export function resolveRedlineReviewModel(
  choice: RedlineReviewModelChoice,
  contractCharCount: number,
): ResolvedRedlineReviewModel {
  if (choice !== "auto") {
    return withChoice(choice, MODEL_SPECS[choice]);
  }

  if (contractCharCount > AUTO_OPUS_CHAR_LIMIT) {
    return withChoice("auto", {
      ...MODEL_SPECS.sonnet,
      displayName: "Auto · Sonnet",
      activityName: "Auto",
      statusLead:  "Auto selected Sonnet for this document length",
    });
  }

  return withChoice("auto", {
    ...MODEL_SPECS.opus,
    displayName: "Auto · Opus",
    activityName: "Auto",
    statusLead:  "Auto selected Opus for a focused deep review",
  });
}

export function redlineModelLabel(choice: RedlineReviewModelChoice): string {
  return REDLINE_REVIEW_MODELS.find(m => m.id === choice)?.label ?? "Auto";
}
