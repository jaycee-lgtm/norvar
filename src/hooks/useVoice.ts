"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchVoiceStatus,
  getVoiceSupport,
  loadVoiceSettings,
  saveVoiceSettings,
  type VoiceSettings,
} from "@/lib/voice";
import { speakWithElevenLabs, stopSpeaking, transcribeWithElevenLabs } from "@/lib/voice-client";
import { startVoiceCapture } from "@/lib/voice-recorder";

type UseVoiceOptions = {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAutoSend?: (text: string) => void | Promise<void>;
  disabled?: boolean;
};

export function useVoice(options: UseVoiceOptions = {}) {
  const { onTranscript, onAutoSend, disabled = false } = options;

  const [settings, setSettings] = useState<VoiceSettings>(loadVoiceSettings);
  const [support, setSupport] = useState(getVoiceSupport);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const captureRef = useRef<Awaited<ReturnType<typeof startVoiceCapture>> | null>(null);
  const optionsRef = useRef(options);
  const settingsRef = useRef(settings);
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<() => void>(() => {});
  optionsRef.current = options;
  settingsRef.current = settings;

  useEffect(() => {
    const base = getVoiceSupport();
    void fetchVoiceStatus().then(status => {
      setSupport({ ...base, configured: status.configured });
    });
    setSettings(loadVoiceSettings());
  }, []);

  useEffect(() => {
    saveVoiceSettings(settings);
  }, [settings]);

  const toggleSpeakResponses = useCallback(() => {
    setSettings(prev => ({ ...prev, speakResponses: !prev.speakResponses }));
    setVoiceError(null);
  }, []);

  const toggleVoiceConversation = useCallback(() => {
    setSettings(prev => {
      const voiceConversation = !prev.voiceConversation;
      if (voiceConversation) {
        window.setTimeout(() => startListeningRef.current(), 250);
      } else {
        stopListeningRef.current();
      }
      return {
        ...prev,
        voiceConversation,
        speakResponses: voiceConversation ? true : prev.speakResponses,
      };
    });
    setVoiceError(null);
  }, []);

  const stopSpeak = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
  }, []);

  const stopListening = useCallback(() => {
    captureRef.current?.cancel();
    captureRef.current = null;
    setIsListening(false);
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
    if (disabled || !support.stt || isListening || isSpeaking) return;

    if (!support.configured) {
      setVoiceError("Connect ElevenLabs on Vercel to enable AI voice.");
      return;
    }

    setVoiceError(null);
    stopListening();
    stopSpeak();

    try {
      const capture = await startVoiceCapture();
      captureRef.current = capture;
      setIsListening(true);

      const audio = await capture.stop();
      captureRef.current = null;
      setIsListening(false);

      if (!audio || audio.size === 0) return;

      setIsListening(true);
      let text = "";
      try {
        text = await transcribeWithElevenLabs(audio);
      } finally {
        setIsListening(false);
      }

      if (!text) return;

      optionsRef.current.onTranscript?.(text, true);

      if (settingsRef.current.voiceConversation && optionsRef.current.onAutoSend) {
        await optionsRef.current.onAutoSend(text);
      }
    } catch (e: unknown) {
      captureRef.current = null;
      setIsListening(false);

      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setVoiceError("Microphone access was denied.");
        return;
      }

      setVoiceError(e instanceof Error ? e.message : "Could not capture speech.");
    }
  }, [disabled, isListening, isSpeaking, stopListening, stopSpeak, support.configured, support.stt]);

  startListeningRef.current = () => {
    void startListening();
  };
  stopListeningRef.current = stopListening;

  const speakAfterResponse = useCallback((text: string) => {
    if (!text.trim()) return;
    if (settings.speakResponses || settings.voiceConversation) {
      void speak(text, () => {
        if (settings.voiceConversation && !disabled) {
          window.setTimeout(() => startListeningRef.current(), 400);
        }
      });
    } else if (settings.voiceConversation && !disabled) {
      window.setTimeout(() => startListeningRef.current(), 400);
    }
  }, [disabled, settings.speakResponses, settings.voiceConversation, speak]);

  useEffect(() => {
    return () => {
      stopListening();
      stopSpeak();
    };
  }, [stopListening, stopSpeak]);

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
    isSpeaking,
    voiceError,
    toggleSpeakResponses,
    toggleVoiceConversation,
    startListening: () => { void startListening(); },
    stopListening,
    speak,
    stopSpeak,
    speakAfterResponse,
    clearError: () => setVoiceError(null),
  };
}
