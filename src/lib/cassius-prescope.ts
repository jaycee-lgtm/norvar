export const ASSESSMENT_CONFIRM_YES = "Yes, let's assess";
export const ASSESSMENT_CONFIRM_NOT_YET = "Not yet";

export const ASSESSMENT_CONFIRM_OPTIONS = [
  ASSESSMENT_CONFIRM_YES,
  ASSESSMENT_CONFIRM_NOT_YET,
] as const;

const GREETING_RE = /^(hi|hello|hey|good morning|good afternoon|good evening|howdy|yo|sup|hiya|thanks|thank you)(\s+there)?$/i;

const ASSESSMENT_SIGNAL_RE = /\b(build|building|deploy|launch|process|processing|collect|collecting|store|storing|cctv|camera|biometric|surveillance|app|application|platform|system|data|users?|customers?|employees?|ai\b|ml\b|model|vendor|cloud|saas|privacy|gdpr|hipaa|compliance|office|offices|product|service|website|api|tool|database|tracking|monitoring|children|health|finance|fintech|robot|iot|device)\b/i;

export function isCasualGreeting(text: string): boolean {
  const trimmed = text.trim().replace(/[!?.]+$/, "");
  if (!trimmed) return true;
  if (GREETING_RE.test(trimmed)) return true;
  return trimmed.length < 14 && !ASSESSMENT_SIGNAL_RE.test(trimmed);
}

export function looksLikeAssessmentDescription(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return false;
  if (isCasualGreeting(trimmed)) return false;
  return ASSESSMENT_SIGNAL_RE.test(trimmed) || trimmed.length >= 55;
}

export function buildAssessmentConfirmationText(): string {
  return "It sounds like you're describing something that needs a formal compliance assessment — is that right?";
}

export function buildAssessmentScopingIntroText(): string {
  return "Great — I'll ask a few questions to make sure I give you the most accurate assessment. Your answers define the scope, and I won't assume anything you don't confirm.";
}

export function isAffirmativeAssessmentConfirm(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(yes|yeah|yep|yup|sure|correct|right|absolutely|definitely|let's assess|lets assess|go ahead|please do|that'?s right|sounds good)/.test(t)
    || t.includes("let's assess")
    || t.includes("lets assess");
}

export function isNegativeAssessmentConfirm(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no|nope|not yet|not really|not now|not quite|maybe later|hold on|wait)/.test(t);
}
