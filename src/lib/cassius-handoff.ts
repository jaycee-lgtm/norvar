import { ASSESS_AGENT } from "@/lib/agents";

export const CASSIUS_CAPABILITY =
  `${ASSESS_AGENT.name} runs formal compliance risk assessments — guided scoping questions about your deployment, then a structured gap analysis with severity ratings, framework citations, and remediation steps tied to what you confirmed.`;

const AFFIRMATIVE_RE =
  /^(yes|yeah|yep|yup|sure|ok|okay|please|absolutely|definitely|go ahead|sounds good|let'?s do it|take me there|switch me over)\b/i;

export function lastMessageOfferedCassiusHandoff(assistantText: string): boolean {
  const t = assistantText.toLowerCase();
  return (
    (t.includes("cassius") || t.includes("formal assessment") || t.includes("risk assessment"))
    && (t.includes("would you like") || t.includes("want me to take") || t.includes("shall i take") || t.includes("take you to"))
  );
}

export function isCassiusHandoffAffirmative(userText: string): boolean {
  const trimmed = userText.trim();
  if (!trimmed) return false;
  if (AFFIRMATIVE_RE.test(trimmed)) return true;
  return /^(yes|yeah|yep|sure|ok|okay)[\s,.!]*$/i.test(trimmed);
}

export function shouldRedirectToCassius(userText: string, lastAssistantText?: string): boolean {
  if (!lastAssistantText) return false;
  return isCassiusHandoffAffirmative(userText) && lastMessageOfferedCassiusHandoff(lastAssistantText);
}
