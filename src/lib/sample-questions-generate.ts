import Anthropic from "@anthropic-ai/sdk";
import { CHAT_AGENT, ASSESS_AGENT } from "@/lib/agents";
import { pickNoraFollowUps } from "@/lib/agent-prompts";
import {
  fallbackSampleQuestions,
  sampleQuestionsCount,
  type SampleQuestionsContext,
} from "@/lib/sample-questions";

export type SampleQuestionGap = {
  title?:    string;
  severity?: string;
  domain?:   string;
};

export type SampleQuestionsPayload = {
  gaps?:             SampleQuestionGap[];
  assessmentTitle?:  string;
};

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildPrompt(
  context: SampleQuestionsContext,
  payload?: SampleQuestionsPayload,
  exclude?: string[],
): string {
  const count = sampleQuestionsCount(context);
  const avoid = exclude?.length
    ? `\nDo NOT repeat or closely paraphrase these recent questions:\n${exclude.map(q => `- ${q}`).join("\n")}`
    : "";

  if (context === "chat") {
    return `You curate example questions for ${CHAT_AGENT.name}, Norvar's GRC chat assistant.
Generate exactly ${count} fresh, diverse questions a compliance professional might ask about regulations, audits, privacy, AI governance, cybersecurity, and cross-border compliance.
Each question must be one sentence, under 110 characters, specific (name a regulation, scenario, or framework), and actionable.
Return ONLY a JSON array of ${count} strings.${avoid}`;
  }

  if (context === "assess") {
    return `You curate starter prompts for ${ASSESS_AGENT.name}, Norvar's compliance assessment agent.
Generate exactly ${count} fresh example descriptions users could submit to start a formal compliance assessment of a product, deployment, vendor, or data practice.
Each prompt must be one sentence, under 130 characters, describe a concrete technology or use case, and mention geography where relevant.
Return ONLY a JSON array of ${count} strings.${avoid}`;
  }

  const gapSummary = payload?.gaps?.slice(0, 6).map(g =>
    `- [${g.severity ?? "unknown"}/${g.domain ?? "general"}] ${g.title ?? "Gap"}`,
  ).join("\n") ?? "";

  return `You curate follow-up questions after a compliance assessment on Norvar.
Assessment: ${payload?.assessmentTitle ?? "Recent assessment"}
Top gaps:
${gapSummary || "(use general post-assessment follow-ups)"}

Generate exactly ${count} concise follow-up questions the user might ask ${ASSESS_AGENT.name} about these findings — prioritisation, remediation steps, regulatory meaning, or escalation to Legal.
Each under 100 characters. Return ONLY a JSON array of ${count} strings.${avoid}`;
}

export function parseSampleQuestionsJson(raw: string, limit: number): string[] {
  const start = raw.indexOf("[");
  const end   = raw.lastIndexOf("]");
  const clean = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();

  try {
    const parsed = JSON.parse(clean) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .map(q => q.trim())
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function generateSampleQuestions(
  context: SampleQuestionsContext,
  payload?: SampleQuestionsPayload,
  exclude?: string[],
): Promise<string[]> {
  const limit = sampleQuestionsCount(context);
  const fallback = context === "assessment-followup" && payload?.gaps?.length
    ? pickNoraFollowUps(payload.gaps, limit)
    : fallbackSampleQuestions(context);

  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const response = await claude.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 700,
      messages:   [{
        role:    "user",
        content: buildPrompt(context, payload, exclude),
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const questions = parseSampleQuestionsJson(raw, limit);
    return questions.length > 0 ? questions : fallback;
  } catch {
    return fallback;
  }
}
