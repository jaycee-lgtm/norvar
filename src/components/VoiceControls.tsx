"use client";

import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";

type VoiceControlsProps = {
  speakEnabled: boolean;
  conversationEnabled: boolean;
  onToggleSpeak: () => void;
  onToggleConversation: () => void;
  isListening: boolean;
  isSpeaking: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
  ttsSupported: boolean;
  sttSupported: boolean;
  configured?: boolean;
  disabled?: boolean;
  compact?: boolean;
};

function TogglePill({
  active,
  onClick,
  icon,
  label,
  title,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 20,
        border: active ? "0.5px solid var(--bdr3)" : "0.5px solid var(--bdr2)",
        background: active ? "var(--card2)" : "transparent",
        color: active ? "var(--fg)" : "var(--fg3)",
        fontSize: 11,
        fontFamily: "'Sora', sans-serif",
        letterSpacing: "-0.01em",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default function VoiceControls({
  speakEnabled,
  conversationEnabled,
  onToggleSpeak,
  onToggleConversation,
  isListening,
  isSpeaking,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  ttsSupported,
  sttSupported,
  configured = true,
  disabled = false,
  compact = false,
}: VoiceControlsProps) {
  if (!ttsSupported && !sttSupported) return null;

  const controlsDisabled = disabled || !configured;
  const micDisabled = controlsDisabled || !sttSupported || isSpeaking;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 6 : 8,
        flexWrap: "wrap",
        marginBottom: compact ? 0 : 8,
      }}
    >
      {ttsSupported && (
        <TogglePill
          active={speakEnabled}
          onClick={onToggleSpeak}
          disabled={controlsDisabled}
          title="AI reads assistant replies aloud via ElevenLabs"
          label="Voice mode"
          icon={speakEnabled ? <Volume2 size={12} strokeWidth={2} /> : <VolumeX size={12} strokeWidth={2} />}
        />
      )}

      {sttSupported && (
        <TogglePill
          active={conversationEnabled}
          onClick={onToggleConversation}
          disabled={controlsDisabled}
          title="Hands-free voice chat — AI listens, responds, and speaks via ElevenLabs"
          label="Use voice mode"
          icon={<Mic size={12} strokeWidth={2} />}
        />
      )}

      {conversationEnabled && sttSupported && (
        <button
          type="button"
          title={isListening ? "Stop listening" : "Start speaking"}
          onClick={isListening ? onStopListening : onStartListening}
          disabled={micDisabled}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: isListening ? "0.5px solid var(--rh)" : "0.5px solid var(--bdr2)",
            background: isListening ? "rgba(239, 68, 68, 0.12)" : "transparent",
            color: isListening ? "var(--rh)" : "var(--fg3)",
            cursor: micDisabled ? "not-allowed" : "pointer",
            opacity: micDisabled && !isListening ? 0.45 : 1,
            animation: isListening ? "pulse-dot 1.2s ease infinite" : undefined,
          }}
        >
          {isListening ? <MicOff size={13} strokeWidth={2} /> : <Mic size={13} strokeWidth={2} />}
        </button>
      )}

      {isSpeaking && (
        <button
          type="button"
          onClick={onStopSpeaking}
          style={{
            fontSize: 10,
            color: "var(--fg3)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "'Sora', sans-serif",
            padding: "2px 4px",
          }}
        >
          Stop reading
        </button>
      )}
    </div>
  );
}

export function VoiceErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <p style={{ fontSize: 11, color: "var(--rh)", marginBottom: 6, fontFamily: "'Sora', sans-serif" }}>
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
