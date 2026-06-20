export const ASSESSMENT_CONFIRM_YES = "Yes, let's assess";
export const ASSESSMENT_CONFIRM_NOT_YET = "Not yet";

export const ASSESSMENT_CONFIRM_OPTIONS = [
  ASSESSMENT_CONFIRM_YES,
  ASSESSMENT_CONFIRM_NOT_YET,
] as const;

const GREETING_RE = /^(hi|hello|hey|good morning|good afternoon|good evening|howdy|yo|sup|hiya|thanks|thank you)(\s+there)?$/i;

const ASSESSMENT_SIGNAL_RE = /\b(build|building|deploy|launch|process|processing|collect|collecting|store|storing|cctv|camera|biometric|surveillance|app|application|platform|system|data|users?|customers?|employees?|ai\b|ml\b|model|vendor|cloud|saas|privacy|gdpr|hipaa|compliance|office|offices|product|service|website|api|tool|database|tracking|monitoring|children|health|finance|fintech|robot|iot|device)\b/i;
const ASSISTANT_IDENTITY_RE = /^(are|r)\s+(you|u)\s+(an?\s+)?(ai|bot|robot)\??$/i;
const DETAIL_REQUEST_RE = /\b(what\s+(do\s+you\s+need|else\s+do\s+you\s+need|information\s+do\s+you\s+need|details\s+do\s+you\s+need|should\s+i\s+(share|provide|tell\s+you))|what\s+(else|next)|what\s+questions|how\s+do\s+we\s+(scope|assess)|how\s+would\s+you\s+(scope|assess))\b/i;

export function isCasualGreeting(text: string): boolean {
  const trimmed = text.trim().replace(/[!?.]+$/, "");
  if (!trimmed) return true;
  if (GREETING_RE.test(trimmed)) return true;
  return trimmed.length < 14 && !ASSESSMENT_SIGNAL_RE.test(trimmed);
}

export function looksLikeAssessmentDescription(text: string): boolean {
  const trimmed = text.trim();
  if (ASSISTANT_IDENTITY_RE.test(trimmed)) return false;
  if (isCasualGreeting(trimmed)) return false;
  if (trimmed.length < 15) return ASSESSMENT_SIGNAL_RE.test(trimmed);
  return ASSESSMENT_SIGNAL_RE.test(trimmed) || trimmed.length >= 45;
}

type PrescopeTurn = { role: string; content?: string; text?: string };

export function buildConversationDescription(
  messages: PrescopeTurn[],
  latestText?: string,
): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role !== "user" || !m.content) continue;
    const t = m.content.trim();
    if (!t || isCasualGreeting(t) || isAssessmentDetailRequest(t)) continue;
    parts.push(t);
  }
  if (latestText) {
    const t = latestText.trim();
    if (t && !isCasualGreeting(t) && !isAssessmentDetailRequest(t) && !parts.includes(t)) parts.push(t);
  }
  return parts.join(" ").trim();
}

export function conversationLooksLikeAssessment(
  messages: PrescopeTurn[],
  latestText?: string,
): boolean {
  const combined = buildConversationDescription(messages, latestText);
  return combined.length > 0 && looksLikeAssessmentDescription(combined);
}

export function isAssessmentReadyReply(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(okay|ok|yes|yeah|yep|yup|sure|correct|right|absolutely|definitely|let's assess|lets assess|go ahead|please do|that'?s right|sounds good)/.test(t)
    || t.includes("let's assess")
    || t.includes("lets assess");
}

export function buildAssessmentConfirmationText(): string {
  return "It sounds like you're describing something that needs a formal compliance assessment — is that right?";
}

export function isAssessmentDetailRequest(text: string): boolean {
  return DETAIL_REQUEST_RE.test(text.trim().toLowerCase());
}

export function buildAssessmentDetailRequestText(description?: string): string {
  const subject = description?.toLowerCase().includes("robot") ? "the robot" : "it";
  return `To scope ${subject}, I need the practical basics: what it does, where it will operate, who will interact with it, what sensors or data it collects, whether it makes autonomous decisions, and where you plan to deploy it. A sentence or a few bullets is enough.`;
}

export function buildAssessmentNotYetText(description?: string): string {
  if (!description?.trim()) {
    return "No problem — tell me a bit more about what you're working on, and we can shape it before a formal assessment.";
  }
  return `No problem. ${buildAssessmentDetailRequestText(description)}`;
}

export function buildAssessmentScopingIntroText(): string {
  return "Great — I'll ask a few questions to make sure I give you the most accurate assessment. Your answers define the scope, and I won't assume anything you don't confirm.";
}

export function isAffirmativeAssessmentConfirm(text: string): boolean {
  return isAssessmentReadyReply(text);
}

export function isNegativeAssessmentConfirm(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no|nope|not yet|not really|not now|not quite|maybe later|hold on|wait)/.test(t);
}
