"use client";

import { Loader2, Mic, MicOff, Volume2 } from "lucide-react";
import HoverTip from "@/components/HoverTip";

type VoiceInputIconProps = {
  isListening: boolean;
  isTranscribing?: boolean;
  isSpeaking: boolean;
  voiceActive: boolean;
  configured: boolean;
  disabled?: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
  agentName?: string;
  size?: "md" | "sm";
};

export function VoiceInputIcon({
  isListening,
  isTranscribing = false,
  isSpeaking,
  voiceActive,
  configured,
  disabled = false,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  agentName = "Nora",
  size = "md",
}: VoiceInputIconProps) {
  const iconSize = size === "sm" ? 14 : 22;
  const btnClass = size === "sm" ? "voice-input-btn voice-input-btn-sm" : "voice-input-btn";
  const isBusy = isListening || isTranscribing || isSpeaking;
  const isActive = isBusy || voiceActive;
  const isDisabled = disabled || !configured;

  const handleClick = () => {
    if (isListening) onStopListening();
    else if (isSpeaking) onStopSpeaking();
    else if (!isTranscribing) onStartListening();
  };

  let title = `Speak to ${agentName}`;
  if (isTranscribing) title = "Transcribing…";
  else if (isListening) title = "Stop listening";
  else if (isSpeaking) title = "Stop reading";
  else if (!configured) title = "Voice not configured — set up in Settings";

  return (
    <HoverTip label={title}>
      <button
        type="button"
        className={`${btnClass}${isActive ? " active" : ""}${isListening ? " listening" : ""}${isTranscribing ? " transcribing" : ""}`}
        onClick={handleClick}
        disabled={(isDisabled && !isBusy) || isTranscribing}
        aria-label={title}
      >
        {isTranscribing
          ? <Loader2 size={iconSize} className="spin" strokeWidth={2} />
          : isListening
            ? <MicOff size={iconSize} strokeWidth={2} />
            : isSpeaking
              ? <Volume2 size={iconSize} strokeWidth={2} />
              : <Mic size={iconSize} strokeWidth={2} />}
      </button>
    </HoverTip>
  );
}

export function VoiceErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 6, fontFamily: "'Sora', sans-serif" }}>
      {message}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            marginLeft: 8,
            fontSize: 10,
            color: "var(--fg3)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "'Sora', sans-serif",
          }}
        >
          Dismiss
        </button>
      )}
    </p>
  );
}
