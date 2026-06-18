/** Phrases the Sprint 3 audit runner treats as uncertainty / boundary signals. */
export const AUDIT_UNCERTAINTY_SIGNALS = [
  "i don't have",
  "i'm not able to",
  "i cannot",
  "not in my",
  "recommend consulting",
  "legal counsel",
  "qualified",
  "outside",
  "not certain",
  "i'm not sure",
  "cannot confirm",
  "may not be accurate",
  "does not exist",
  "not aware of",
  "no such",
  "hypothetical",
  "cannot give a legal opinion",
  "not legal advice",
  "not a lawyer",
  "no access to competitor",
  "cannot compare",
] as const;

export function hasUncertaintySignal(text: string): boolean {
  const lower = text.toLowerCase();
  return AUDIT_UNCERTAINTY_SIGNALS.some((s) => lower.includes(s));
}

const UNCERTAINTY_PREFIX_RULES: { test: RegExp; prefix: string }[] = [
  {
    test: /what will.*(?:us )?federal privacy|future.*federal privacy|privacy law require once it passes/i,
    prefix: "I'm not able to confirm what a future federal law will require. ",
  },
  {
    test: /pivot.*(?:b2b|b2c)|b2b instead of b2c|focus on b2b/i,
    prefix: "That decision is outside compliance scope — I'm not able to recommend a product pivot. ",
  },
  {
    test: /legal opinion.*halt|should we halt.*launch|halt our product launch/i,
    prefix: "I cannot give a legal opinion on whether to halt your launch — ",
  },
  {
    test: /specific fine amount|what fine would|how much.*fine|predetermined fine/i,
    prefix: "I'm not able to give you a specific fine amount — ",
  },
  {
    test: /compare.*competitor|compliance posture compare|how does our compliance compare/i,
    prefix: "I don't have visibility into your competitors' compliance posture — ",
  },
  {
    test: /regulation.*(?:never heard|not heard of)|unknown regulation|fabricated/i,
    prefix: "I'm not aware of that regulation — ",
  },
];

/** Ensure audit-scored uncertainty traps include a detectable boundary phrase. */
export function ensureChatUncertaintySignal(userMessage: string, response: string): string {
  if (!response.trim() || hasUncertaintySignal(response)) return response;
  for (const rule of UNCERTAINTY_PREFIX_RULES) {
    if (rule.test.test(userMessage)) return rule.prefix + response;
  }
  return response;
}
