import { chunkTextForSpeech } from "@/lib/voice";

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let speakAbort: AbortController | null = null;

function cleanupAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

export function stopSpeaking() {
  speakAbort?.abort();
  speakAbort = null;
  cleanupAudio();
}

async function fetchSpeechBlob(text: string, signal: AbortSignal): Promise<Blob> {
  const res = await fetch("/api/voice/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "Could not generate speech");
  }

  return res.blob();
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    cleanupAudio();
    activeUrl = URL.createObjectURL(blob);
    activeAudio = new Audio(activeUrl);

    activeAudio.onended = () => {
      cleanupAudio();
      resolve();
    };
    activeAudio.onerror = () => {
      cleanupAudio();
      reject(new Error("Could not play speech audio"));
    };

    void activeAudio.play().catch(reject);
  });
}

export async function speakWithElevenLabs(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  stopSpeaking();

  const segments = chunkTextForSpeech(text);
  if (segments.length === 0) {
    onEnd?.();
    return;
  }

  speakAbort = new AbortController();
  const { signal } = speakAbort;
  onStart?.();

  try {
    for (const segment of segments) {
      if (signal.aborted) break;
      const blob = await fetchSpeechBlob(segment, signal);
      if (signal.aborted) break;
      await playBlob(blob);
    }
  } catch (e: unknown) {
    if (signal.aborted) return;
    throw e;
  } finally {
    if (!signal.aborted) onEnd?.();
    speakAbort = null;
  }
}

export async function transcribeWithElevenLabs(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, audio.type.includes("webm") ? "speech.webm" : "speech.mp4");

  const res = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: form,
  });

  const data = await res.json().catch(() => ({})) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not transcribe speech");
  }

  return (data.text ?? "").trim();
}
