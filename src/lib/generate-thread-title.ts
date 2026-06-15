import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TITLE_MODEL = "claude-haiku-4-5-20251001";

function sanitizeTitle(raw: string, maxLen = 72): string {
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^title:\s*/i, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "");
  if (!cleaned) return "";
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 3).trim()}...` : cleaned;
}

function fallbackTitle(text: string, maxLen = 60): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "Untitled";
  return t.length > maxLen ? `${t.slice(0, maxLen - 3)}...` : t;
}

async function requestTitle(system: string, user: string): Promise<string | null> {
  try {
    const response = await claude.messages.create({
      model:      TITLE_MODEL,
      max_tokens: 40,
      system,
      messages:   [{ role: "user", content: user }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const title = sanitizeTitle(raw);
    return title || null;
  } catch (err) {
    console.error("Title generation failed:", err);
    return null;
  }
}

export async function generateChatTitle(
  userMessage: string,
  assistantReply: string,
): Promise<string> {
  const summary = assistantReply.trim().slice(0, 1200);
  const question = userMessage.trim().slice(0, 400);

  const generated = await requestTitle(
    `You name GRC chat threads in a compliance product sidebar.
Return ONLY a concise title (4–8 words). No quotes. No trailing punctuation.
Focus on the compliance topic, regulation, or deployment — not generic words like "question" or "help".`,
    `User question:\n${question}\n\nAssistant reply (summary source):\n${summary}`,
  );

  return generated ?? fallbackTitle(question || summary);
}

export async function generateAssessmentTitle(
  summary: string,
  opts?: {
    gapTitles?: string[];
    description?: string;
  },
): Promise<string> {
  const summaryText = summary.trim().slice(0, 1400);
  const gapLines = (opts?.gapTitles ?? []).slice(0, 4).map(t => `- ${t}`).join("\n");
  const context = opts?.description?.trim().slice(0, 400) ?? "";

  const generated = await requestTitle(
    `You name compliance assessments in a GRC product sidebar.
Return ONLY a concise title (4–8 words). No quotes. No trailing punctuation.
Name the deployment or compliance scope — e.g. "EU HR Screening Tool" not "Compliance Assessment".`,
    [
      summaryText ? `Assessment summary:\n${summaryText}` : "",
      gapLines ? `Key gaps:\n${gapLines}` : "",
      context ? `Initial description:\n${context}` : "",
    ].filter(Boolean).join("\n\n"),
  );

  return generated ?? fallbackTitle(summaryText || context || "Compliance assessment");
}

export async function generateDraftDocumentTitle(opts: {
  agreementTypeLabel: string;
  providerName:       string;
  customerName:       string;
  jurisdictions:      string[];
  context?:           string;
}): Promise<string> {
  const userDesc = [
    `Agreement type: ${opts.agreementTypeLabel}`,
    `Provider / service company: ${opts.providerName}`,
    `Customer / client: ${opts.customerName}`,
    opts.jurisdictions.length ? `Jurisdictions: ${opts.jurisdictions.join(", ")}` : "",
    opts.context ? `Additional context: ${opts.context}` : "",
  ].filter(Boolean).join("\n");

  const generated = await requestTitle(
    `You name drafted legal agreements saved as documents in a GRC product.
Return ONLY a concise document title (5–14 words). No quotes. No file extension. No trailing punctuation.
The title must reflect exactly what the user specified — use their company names, product names, and agreement type.
Prefer the user's own wording. Examples:
- "Norvar–Acme Master Services Agreement"
- "Norvar GRC Platform Data Processing Agreement"
- "Privacy Policy for Norvar SaaS (EU & US)"`,
    userDesc,
  );

  const fallback = [
    opts.providerName !== "[Provider Name]" ? opts.providerName : "",
    opts.customerName !== "[Customer Name]" ? opts.customerName : "",
    opts.agreementTypeLabel,
  ].filter(Boolean).join(" — ");

  return generated ?? fallbackTitle(fallback || opts.agreementTypeLabel, 80);
}
