import Anthropic from "@anthropic-ai/sdk";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { RedlineProvider } from "@/lib/redline-models";

export type RedlineGenerateResult = {
  text:      string;
  truncated: boolean;
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function requireApiKey(provider: RedlineProvider): void {
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (provider === "google" && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
  }
}

export async function generateRedlineText(options: {
  provider:     RedlineProvider;
  modelId:      string;
  systemPrompt: string;
  userMsg:      string;
  maxTokens:    number;
}): Promise<RedlineGenerateResult> {
  const { provider, modelId, systemPrompt, userMsg, maxTokens } = options;
  requireApiKey(provider);

  if (provider === "anthropic") {
    const response = await anthropic.messages.create({
      model:      modelId,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userMsg }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return {
      text,
      truncated: response.stop_reason === "max_tokens",
    };
  }

  if (provider === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await generateText({
      model:             openai(modelId),
      system:            systemPrompt,
      prompt:            userMsg,
      maxOutputTokens:   maxTokens,
    });
    return {
      text:      result.text,
      truncated: result.finishReason === "length",
    };
  }

  const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
  const result = await generateText({
    model:             google(modelId),
    system:            systemPrompt,
    prompt:            userMsg,
    maxOutputTokens:   maxTokens,
  });
  return {
    text:      result.text,
    truncated: result.finishReason === "length",
  };
}
