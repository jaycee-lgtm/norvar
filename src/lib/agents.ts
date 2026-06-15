/** GRC chat agent (free-form conversation). */
export const CHAT_AGENT = {
  name: "Nora",
} as const;

/** Compliance assessment agent (assessments, inference, follow-ups). */
export const ASSESS_AGENT = {
  name: "Cassius",
} as const;

/** Contract review and redline agent. */
export const VARRO_AGENT = {
  name: "Varro",
} as const;

/** Agreement drafting agent. */
export const PERTA_AGENT = {
  name: "Perta",
} as const;

/** @deprecated Use PERTA_AGENT */
export const SCRIBE_AGENT = PERTA_AGENT;
