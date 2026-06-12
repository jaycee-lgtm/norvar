import {
  ELEVENLABS_SPEECH_MODEL,
  ELEVENLABS_VOICE_ID,
} from "@/lib/elevenlabs-config";

export type UserAiSettings = {
  voiceSpeakResponses: boolean;
  voiceConversation: boolean;
  elevenlabsVoiceId: string;
  speechSpeed: number;
  speechModel: string;
};

export const AI_SETTINGS_EVENT = "norvar-ai-settings-updated";

export const VOICE_OPTIONS = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", description: "Calm, professional" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam", description: "Deep, authoritative" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", description: "Warm, clear" },
  { id: "onwK4e9ZLuTAKqWWgF7", label: "Daniel", description: "British, formal" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte", description: "Neutral, steady" },
] as const;

export const SPEECH_MODEL_OPTIONS = [
  { id: "eleven_flash_v2_5", label: "Flash", description: "Fastest — best for conversation" },
  { id: "eleven_multilingual_v2", label: "Multilingual", description: "Highest quality" },
  { id: "eleven_turbo_v2_5", label: "Turbo", description: "Balanced speed and quality" },
] as const;

export const DEFAULT_USER_AI_SETTINGS: UserAiSettings = {
  voiceSpeakResponses: false,
  voiceConversation: false,
  elevenlabsVoiceId: ELEVENLABS_VOICE_ID,
  speechSpeed: 1,
  speechModel: ELEVENLABS_SPEECH_MODEL,
};

export function mergeUserAiSettings(raw: unknown): UserAiSettings {
  const input = (raw && typeof raw === "object") ? raw as Partial<UserAiSettings> : {};
  const speed = typeof input.speechSpeed === "number"
    ? Math.min(1.2, Math.max(0.7, input.speechSpeed))
    : DEFAULT_USER_AI_SETTINGS.speechSpeed;

  return {
    voiceSpeakResponses: !!input.voiceSpeakResponses,
    voiceConversation: !!input.voiceConversation,
    elevenlabsVoiceId: typeof input.elevenlabsVoiceId === "string" && input.elevenlabsVoiceId.length > 0
      ? input.elevenlabsVoiceId
      : DEFAULT_USER_AI_SETTINGS.elevenlabsVoiceId,
    speechSpeed: speed,
    speechModel: typeof input.speechModel === "string" && input.speechModel.length > 0
      ? input.speechModel
      : DEFAULT_USER_AI_SETTINGS.speechModel,
  };
}

export function voiceSettingsFromAiSettings(settings: UserAiSettings) {
  return {
    speakResponses: settings.voiceSpeakResponses,
    voiceConversation: settings.voiceConversation,
  };
}

export function broadcastAiSettings(settings: UserAiSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_SETTINGS_EVENT, { detail: settings }));
}

export async function fetchUserAiSettings(): Promise<UserAiSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) return DEFAULT_USER_AI_SETTINGS;
  const data = await res.json() as { settings?: unknown };
  return mergeUserAiSettings(data.settings);
}

export async function saveUserAiSettings(
  patch: Partial<UserAiSettings>,
): Promise<UserAiSettings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  const data = await res.json() as { settings?: unknown; error?: string };
  if (!res.ok) throw new Error(data.error || "Could not save settings");

  const settings = mergeUserAiSettings(data.settings);
  broadcastAiSettings(settings);
  return settings;
}
