import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { experimental_transcribe as transcribe } from "ai";
import { createElevenLabs } from "@ai-sdk/elevenlabs";
import {
  ELEVENLABS_TRANSCRIPTION_MODEL,
  requireElevenLabsApiKey,
} from "@/lib/elevenlabs-config";
import { humanizeVoiceError } from "@/lib/voice-errors";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio file is too large" }, { status: 413 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const elevenlabs = createElevenLabs({ apiKey: requireElevenLabsApiKey() });

    const result = await transcribe({
      model: elevenlabs.transcription(ELEVENLABS_TRANSCRIPTION_MODEL),
      audio: bytes,
      providerOptions: {
        elevenlabs: {
          languageCode: "en",
          tagAudioEvents: false,
          diarize: false,
          fileFormat: "other",
        },
      },
    });

    const text = result.text.trim();
    if (!text) {
      return NextResponse.json({ error: "No speech detected" }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (e: unknown) {
    const message = humanizeVoiceError(e instanceof Error ? e.message : "Transcription failed");
    const status = message.includes("not configured") || message.includes("ElevenLabs voice credits")
      ? 503
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
