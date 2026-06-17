import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DRAFT_MODEL = "claude-haiku-4-5-20251001";

export type EscalationDraftInput = {
  gap_title:         string;
  gap_severity:      string;
  gap_domain:        string;
  gap_detail?:       string | null;
  gap_frameworks?:   string[];
  remediation_steps?: string | null;
  project_title?:    string | null;
  recipient_role?:   string | null;
};

export type EscalationDraftResult = {
  question: string;
  context:  string;
};

function buildGapBlock(input: EscalationDraftInput): string {
  return [
    `Title: ${input.gap_title}`,
    `Severity: ${input.gap_severity}`,
    `Domain: ${input.gap_domain}`,
    input.project_title ? `Project: ${input.project_title}` : null,
    input.gap_frameworks?.length ? `Frameworks: ${input.gap_frameworks.join(", ")}` : null,
    input.gap_detail ? `Issue: ${input.gap_detail}` : null,
    input.recipient_role ? `Recipient role: ${input.recipient_role}` : null,
    input.remediation_steps ? `Proposed remediation: ${input.remediation_steps}` : null,
  ].filter(Boolean).join("\n");
}

export function fallbackEscalationDraft(input: EscalationDraftInput): EscalationDraftResult {
  const roleHint = input.recipient_role?.trim()
    ? ` as ${input.recipient_role.trim()}`
    : "";
  return {
    question: `Can you review this ${input.gap_severity} compliance gap and advise on the right remediation approach, risk acceptance, and any decisions we need from you${roleHint}?`,
    context: [
      `We're escalating "${input.gap_title}" from our remediation queue.`,
      input.project_title ? `Project: ${input.project_title}.` : "",
      input.gap_detail ? input.gap_detail.trim() : "",
      input.remediation_steps ? `Current proposed remediation: ${input.remediation_steps}` : "",
    ].filter(Boolean).join("\n\n"),
  };
}

export function parseEscalationDraftJson(raw: string): EscalationDraftResult | null {
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  const slice = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();

  try {
    const parsed = JSON.parse(slice) as { question?: unknown; context?: unknown };
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    const context  = typeof parsed.context === "string" ? parsed.context.trim() : "";
    if (!question) return null;
    return { question, context };
  } catch {
    return null;
  }
}

export async function generateEscalationDraft(
  input: EscalationDraftInput,
): Promise<EscalationDraftResult> {
  const fallback = fallbackEscalationDraft(input);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const roleLine = input.recipient_role?.trim()
    ? `Tailor the question to what you'd ask a ${input.recipient_role.trim()}.`
    : "Write for a senior reviewer such as General Counsel, CISO, or Compliance lead.";

  try {
    const response = await claude.messages.create({
      model:      DRAFT_MODEL,
      max_tokens: 700,
      messages:   [{
        role:    "user",
        content: `You help Norvar users escalate compliance gaps to internal reviewers by email.

Draft an escalation for the gap below. ${roleLine}

Rules:
- "question" must be one clear ask — what decision, approval, or guidance you need from the reviewer (1–2 sentences).
- "context" is optional background for the email (2–4 short sentences): why it matters, urgency, and what you've already considered.
- Plain language. No markdown. No salutation or sign-off.
- Do not invent facts beyond the gap details provided.

GAP:
${buildGapBlock(input)}

Return ONLY JSON:
{"question":"...","context":"..."}`,
      }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    return parseEscalationDraftJson(raw) ?? fallback;
  } catch (err) {
    console.error("Escalation draft generation failed:", err);
    return fallback;
  }
}
