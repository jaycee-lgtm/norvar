"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_SETTINGS_EVENT,
  DEFAULT_USER_AI_SETTINGS,
  fetchUserAiSettings,
  voiceSettingsFromAiSettings,
  type UserAiSettings,
} from "@/lib/user-ai-settings";
import { playVoiceStartSound } from "@/lib/voice-sounds";
import { speakWithElevenLabs, stopSpeaking, transcribeWithElevenLabs } from "@/lib/voice-client";
import { fetchVoiceStatus, getVoiceSupport, type VoiceSettings } from "@/lib/voice";
import { startVoiceCapture } from "@/lib/voice-recorder";

type UseVoiceOptions = {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAutoSend?: (text: string) => void | Promise<void>;
  disabled?: boolean;
};

const DEFAULT_VOICE: VoiceSettings = {
  speakResponses: false,
  voiceConversation: false,
};

export function useVoice(options: UseVoiceOptions = {}) {
  const { onTranscript, onAutoSend, disabled = false } = options;

  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE);
  const [support, setSupport] = useState(getVoiceSupport);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const captureRef = useRef<Awaited<ReturnType<typeof startVoiceCapture>> | null>(null);
  const optionsRef = useRef(options);
  const settingsRef = useRef(settings);
  const aiSettingsRef = useRef<UserAiSettings>(DEFAULT_USER_AI_SETTINGS);
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<() => void>(() => {});
  const micSessionRef = useRef(false);
  optionsRef.current = options;
  settingsRef.current = settings;

  const applyAiSettings = useCallback((ai: UserAiSettings) => {
    aiSettingsRef.current = ai;
    setSettings(voiceSettingsFromAiSettings(ai));
  }, []);

  useEffect(() => {
    const base = getVoiceSupport();
    void Promise.all([fetchVoiceStatus(), fetchUserAiSettings()])
      .then(([status, aiSettings]) => {
        setSupport({ ...base, configured: status.configured });
        applyAiSettings(aiSettings);
      })
      .catch(() => {
        setSupport(base);
      });
  }, [applyAiSettings]);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      applyAiSettings((event as CustomEvent<UserAiSettings>).detail);
    };
    window.addEventListener(AI_SETTINGS_EVENT, onUpdate);
    return () => window.removeEventListener(AI_SETTINGS_EVENT, onUpdate);
  }, [applyAiSettings]);

  const stopSpeak = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
  }, []);

  const stopListening = useCallback(() => {
    micSessionRef.current = false;
    captureRef.current?.cancel();
    captureRef.current = null;
    setIsListening(false);
    setIsTranscribing(false);
  }, []);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    if (!text.trim()) {
      onDone?.();
      return;
    }

    if (!support.configured) {
      setVoiceError("Connect ElevenLabs on Vercel to enable AI voice.");
      onDone?.();
      return;
    }

    try {
      await speakWithElevenLabs(
        text,
        () => setIsSpeaking(true),
        () => {
          setIsSpeaking(false);
          onDone?.();
        },
      );
    } catch (e: unknown) {
      setIsSpeaking(false);
      setVoiceError(e instanceof Error ? e.message : "Could not play AI voice.");
      onDone?.();
    }
  }, [support.configured]);

  const startListening = useCallback(async () => {
    if (disabled || !support.stt || isListening || isTranscribing || isSpeaking) return;

    if (!support.configured) {
      setVoiceError("Connect ElevenLabs on Vercel to enable AI voice.");
      return;
    }

    setVoiceError(null);
    stopSpeak();
    if (captureRef.current) captureRef.current.cancel();

    micSessionRef.current = true;
    if (aiSettingsRef.current.micStartSound) {
      playVoiceStartSound();
    }

    try {
      const capture = await startVoiceCapture();
      captureRef.current = capture;
      setIsListening(true);

      const audio = await capture.finished;
      captureRef.current = null;
      setIsListening(false);

      if (!micSessionRef.current) return;

      if (!audio || audio.size < 800) {
        setVoiceError("No speech detected. Try speaking closer to your microphone.");
        micSessionRef.current = false;
        return;
      }

      setIsTranscribing(true);
      let text = "";
      try {
        text = await transcribeWithElevenLabs(audio);
      } catch (e: unknown) {
        setVoiceError(e instanceof Error ? e.message : "Could not transcribe speech.");
        micSessionRef.current = false;
        return;
      } finally {
        setIsTranscribing(false);
      }

      if (!text) {
        setVoiceError("No speech detected. Try again.");
        micSessionRef.current = false;
        return;
      }

      optionsRef.current.onTranscript?.(text, true);

      if (optionsRef.current.onAutoSend) {
        await optionsRef.current.onAutoSend(text);
      }
    } catch (e: unknown) {
      captureRef.current = null;
      setIsListening(false);
      setIsTranscribing(false);
      micSessionRef.current = false;

      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setVoiceError("Microphone access was denied.");
        return;
      }

      setVoiceError(e instanceof Error ? e.message : "Could not capture speech.");
    }
  }, [disabled, isListening, isTranscribing, isSpeaking, stopSpeak, support.configured, support.stt]);

  startListeningRef.current = () => {
    void startListening();
  };
  stopListeningRef.current = stopListening;

  const speakAfterResponse = useCallback((text: string, fromMic = false) => {
    if (!text.trim()) return;
    const shouldSpeak =
      fromMic ||
      settings.speakResponses ||
      settings.voiceConversation ||
      micSessionRef.current;

    if (shouldSpeak) {
      void speak(text, () => {
        if ((settings.voiceConversation || micSessionRef.current) && !disabled) {
          window.setTimeout(() => startListeningRef.current(), 500);
        } else {
          micSessionRef.current = false;
        }
      });
    } else if (settings.voiceConversation && !disabled) {
      window.setTimeout(() => startListeningRef.current(), 500);
    } else {
      micSessionRef.current = false;
    }
  }, [disabled, settings.speakResponses, settings.voiceConversation, speak]);

  useEffect(() => {
    return () => {
      micSessionRef.current = false;
      captureRef.current?.cancel();
      stopSpeak();
    };
  }, [stopSpeak]);

  useEffect(() => {
    if (disabled) {
      stopListening();
      stopSpeak();
    }
  }, [disabled, stopListening, stopSpeak]);

  return {
    settings,
    support,
    isListening,
    isTranscribing,
    isSpeaking,
    isBusy: isListening || isTranscribing || isSpeaking,
    voiceError,
    startListening: () => { void startListening(); },
    stopListening,
    speak,
    stopSpeak,
    speakAfterResponse,
    clearError: () => setVoiceError(null),
  };
}
