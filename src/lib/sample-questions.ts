export type SampleQuestionsContext = "chat" | "assess" | "assessment-followup";

export const FALLBACK_CHAT_QUESTIONS = [
  "What does the EU AI Act require for high-risk AI systems?",
  "How does GDPR Art.35 DPIA work in practice?",
  "What is the difference between NIS2 and DORA?",
  "Explain Illinois BIPA and the risk for computer vision products",
  "What does the Colorado AI Act require from developers?",
  "How do I prepare for a SOC 2 Type II audit?",
  "What is the NIST AI Risk Management Framework?",
  "When does CCPA apply to my company?",
];

export const FALLBACK_ASSESS_QUESTIONS = [
  "We're launching a hiring AI tool in the EU and US — assess our compliance exposure.",
  "Assess a health app that stores patient records for UK and German users.",
  "We process children's data in a mobile game — what gaps should we expect?",
  "Review our biometric time-clock rollout for warehouse staff in Illinois.",
  "Assess a fintech API sharing transaction data with third-party analytics vendors.",
  "We deploy an internal LLM chatbot for employees — run a formal assessment.",
  "Assess our SaaS platform using automated credit scoring for loan applicants.",
  "We collect location data from delivery drivers across the EU — scope the risks.",
];

/** @deprecated Use FALLBACK_CHAT_QUESTIONS */
export const SAMPLE_QUESTIONS = FALLBACK_CHAT_QUESTIONS;

export function fallbackSampleQuestions(context: SampleQuestionsContext): string[] {
  if (context === "assess") return FALLBACK_ASSESS_QUESTIONS;
  if (context === "assessment-followup") {
    return FALLBACK_ASSESS_QUESTIONS.slice(0, 4);
  }
  return FALLBACK_CHAT_QUESTIONS;
}

export function sampleQuestionsCount(context: SampleQuestionsContext): number {
  return context === "assessment-followup" ? 4 : 8;
}
