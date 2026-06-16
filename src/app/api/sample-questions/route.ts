import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  generateSampleQuestions,
  type SampleQuestionsPayload,
} from "@/lib/sample-questions-generate";
import {
  fallbackSampleQuestions,
  type SampleQuestionsContext,
} from "@/lib/sample-questions";

const VALID_CONTEXTS = new Set<SampleQuestionsContext>([
  "chat",
  "assess",
  "assessment-followup",
]);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  let body: {
    context?:  SampleQuestionsContext;
    payload?: SampleQuestionsPayload;
    exclude?:  string[];
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const context = body.context;
  if (!context || !VALID_CONTEXTS.has(context)) {
    return Response.json({ error: "Invalid context" }, { status: 400 });
  }

  const exclude = Array.isArray(body.exclude)
    ? body.exclude.filter((q): q is string => typeof q === "string").slice(-16)
    : [];

  try {
    const questions = await generateSampleQuestions(context, body.payload, exclude);
    return Response.json({ questions });
  } catch {
    return Response.json({ questions: fallbackSampleQuestions(context) });
  }
}
