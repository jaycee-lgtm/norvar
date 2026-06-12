export type VoiceSettings = {
  speakResponses: boolean;
  voiceConversation: boolean;
};

export type VoiceSupport = {
  tts: boolean;
  stt: boolean;
  configured: boolean;
};

export function getVoiceSupport(): VoiceSupport {
  if (typeof window === "undefined") {
    return { tts: false, stt: false, configured: false };
  }

  return {
    tts: true,
    stt: typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined",
    configured: false,
  };
}

export async function fetchVoiceStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch("/api/voice/status");
    if (!res.ok) return { configured: false };
    const data = await res.json() as { configured?: boolean };
    return { configured: !!data.configured };
  } catch {
    return { configured: false };
  }
}

export function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function chunkTextForSpeech(text: string, maxLen = 2400): string[] {
  const cleaned = stripForSpeech(text);
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const chunks: string[] = [];
  let rest = cleaned;

  while (rest.length > maxLen) {
    let splitAt = rest.lastIndexOf(". ", maxLen);
    if (splitAt < maxLen * 0.4) splitAt = rest.lastIndexOf(" ", maxLen);
    if (splitAt < maxLen * 0.4) splitAt = maxLen;

    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}
