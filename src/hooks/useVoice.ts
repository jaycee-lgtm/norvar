"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_SETTINGS_EVENT,
  fetchUserAiSettings,
  saveUserAiSettings,
  voiceSettingsFromAiSettings,
  type UserAiSettings,
} from "@/lib/user-ai-settings";
import {
  playVoiceDetectedSound,
  playVoiceErrorSound,
  playVoiceSentSound,
  playVoiceStartSound,
  playVoiceStopSound,
} from "@/lib/voice-sounds";
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
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<() => void>(() => {});
  const persistTimerRef = useRef<number | null>(null);
  const micSessionRef = useRef(false);
  optionsRef.current = options;
  settingsRef.current = settings;

  const applyAiSettings = useCallback((ai: UserAiSettings) => {
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

  const persistVoiceToggles = useCallback((next: VoiceSettings) => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      void saveUserAiSettings({
        voiceSpeakResponses: next.speakResponses,
        voiceConversation: next.voiceConversation,
      }).catch(() => {});
    }, 400);
  }, []);

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
    playVoiceStopSound();
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
      playVoiceErrorSound();
      setVoiceError(e instanceof Error ? e.message : "Could not play AI voice.");
      onDone?.();
    }
  }, [support.configured]);

  const startListening = useCallback(async () => {
    if (disabled || !support.stt || isListening || isTranscribing || isSpeaking) return;

    if (!support.configured) {
      setVoiceError("Connect ElevenLabs on Vercel to enable AI voice.");
      playVoiceErrorSound();
      return;
    }

    setVoiceError(null);
    stopSpeak();
    if (captureRef.current) captureRef.current.cancel();

    micSessionRef.current = true;
    playVoiceStartSound();

    try {
      const capture = await startVoiceCapture({
        onSpeechStart: () => playVoiceDetectedSound(),
      });
      captureRef.current = capture;
      setIsListening(true);

      const audio = await capture.finished;
      captureRef.current = null;
      setIsListening(false);

      if (!micSessionRef.current) return;

      playVoiceStopSound();

      if (!audio || audio.size < 800) {
        setVoiceError("No speech detected. Try speaking closer to your microphone.");
        playVoiceErrorSound();
        return;
      }

      setIsTranscribing(true);
      let text = "";
      try {
        text = await transcribeWithElevenLabs(audio);
      } catch (e: unknown) {
        playVoiceErrorSound();
        setVoiceError(e instanceof Error ? e.message : "Could not transcribe speech.");
        return;
      } finally {
        setIsTranscribing(false);
      }

      if (!text) {
        setVoiceError("No speech detected. Try again.");
        playVoiceErrorSound();
        return;
      }

      playVoiceSentSound();
      optionsRef.current.onTranscript?.(text, true);

      const shouldAutoSend = !!optionsRef.current.onAutoSend;
      if (shouldAutoSend) {
        await optionsRef.current.onAutoSend!(text);
      }
    } catch (e: unknown) {
      captureRef.current = null;
      setIsListening(false);
      setIsTranscribing(false);
      micSessionRef.current = false;

      if (e instanceof DOMException && e.name === "NotAllowedError") {
        playVoiceErrorSound();
        setVoiceError("Microphone access was denied.");
        return;
      }

      playVoiceErrorSound();
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
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
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
