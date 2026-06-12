export const ELEVENLABS_SPEECH_MODEL =
  process.env.ELEVENLABS_SPEECH_MODEL ?? "eleven_flash_v2_5";

export const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

export const ELEVENLABS_TRANSCRIPTION_MODEL =
  process.env.ELEVENLABS_TRANSCRIPTION_MODEL ?? "scribe_v1";

export const ELEVENLABS_SPEECH_INSTRUCTIONS =
  process.env.ELEVENLABS_SPEECH_INSTRUCTIONS ??
  "Speak clearly and professionally as a GRC compliance advisor. Use a calm, confident tone.";

export function getElevenLabsApiKey(): string | null {
  return process.env.ELEVENLABS_API_KEY ?? null;
}

export function requireElevenLabsApiKey(): string {
  const key = getElevenLabsApiKey();
  if (!key) {
    throw new Error(
      "ElevenLabs is not configured. Install the ElevenLabs integration on Vercel and set ELEVENLABS_API_KEY.",
    );
  }
  return key;
}
