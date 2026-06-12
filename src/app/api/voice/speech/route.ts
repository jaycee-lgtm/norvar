import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { experimental_generateSpeech as generateSpeech } from "ai";
import { createElevenLabs } from "@ai-sdk/elevenlabs";
import {
  ELEVENLABS_SPEECH_INSTRUCTIONS,
  requireElevenLabsApiKey,
} from "@/lib/elevenlabs-config";
import { getUserAiSettings } from "@/lib/user-ai-settings-server";
import { stripForSpeech } from "@/lib/voice";

const MAX_SPEECH_CHARS = 9000;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cleaned = stripForSpeech(body.text ?? "");
  if (!cleaned) {
    return NextResponse.json({ error: "No text to speak" }, { status: 400 });
  }

  const text = cleaned.length > MAX_SPEECH_CHARS
    ? `${cleaned.slice(0, MAX_SPEECH_CHARS)}…`
    : cleaned;

  try {
    const userSettings = await getUserAiSettings(userId);
    const elevenlabs = createElevenLabs({ apiKey: requireElevenLabsApiKey() });

    const result = await generateSpeech({
      model: elevenlabs.speech(userSettings.speechModel),
      text,
      voice: userSettings.elevenlabsVoiceId,
      outputFormat: "mp3",
      instructions: ELEVENLABS_SPEECH_INSTRUCTIONS,
      language: "en",
      speed: userSettings.speechSpeed,
    });

    return new NextResponse(Buffer.from(result.audio.uint8Array), {
      status: 200,
      headers: {
        "Content-Type": result.audio.mediaType || "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Speech generation failed";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
