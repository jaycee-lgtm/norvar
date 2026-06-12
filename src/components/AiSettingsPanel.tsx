"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_USER_AI_SETTINGS,
  fetchUserAiSettings,
  saveUserAiSettings,
  SPEECH_MODEL_OPTIONS,
  VOICE_OPTIONS,
  type UserAiSettings,
} from "@/lib/user-ai-settings";
import { playVoiceStartSound } from "@/lib/voice-sounds";

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 0",
        borderBottom: "0.5px solid var(--bdr)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span>
        <span style={{ display: "block", fontSize: 13, color: "var(--fg)", fontFamily: "'Sora', sans-serif", letterSpacing: "-0.01em" }}>
          {label}
        </span>
        <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--fg3)", lineHeight: 1.55, fontFamily: "'Sora', sans-serif" }}>
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 3, accentColor: "var(--red)" }}
      />
    </label>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: "var(--fg2)", marginBottom: 8, fontFamily: "'Sora', sans-serif" }}>
      {children}
    </label>
  );
}

export default function AiSettingsPanel() {
  const [settings, setSettings] = useState<UserAiSettings>(DEFAULT_USER_AI_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [voiceConfigured, setVoiceConfigured] = useState(false);

  useEffect(() => {
    void fetchUserAiSettings()
      .then(setSettings)
      .catch(() => setError("Could not load AI settings."))
      .finally(() => setLoading(false));

    fetch("/api/settings")
      .then(r => r.json())
      .then(d => setVoiceConfigured(!!d.voiceConfigured))
      .catch(() => {});
  }, []);

  const persist = useCallback(async (patch: Partial<UserAiSettings>) => {
    setSaving(true);
    setError("");
    try {
      const next = await saveUserAiSettings(patch);
      setSettings(next);
      setSavedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }, []);

  const update = useCallback((patch: Partial<UserAiSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
    void persist(patch);
  }, [persist]);

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 2000);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 28, display: "flex", justifyContent: "center", padding: 32 }}>
        <Loader2 size={18} className="spin" color="var(--fg3)" />
      </div>
    );
  }

  return (
    <section className="card" style={{ marginBottom: 28 }}>
      <p className="stag" style={{ marginBottom: 8 }}>AI</p>
      <h2 style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.03em", marginBottom: 6, fontFamily: "'Sora', sans-serif" }}>
        Voice &amp; assistant preferences
      </h2>
      <p style={{ fontSize: 12, color: "var(--fg3)", lineHeight: 1.65, marginBottom: 18, fontFamily: "'Sora', sans-serif" }}>
        These settings apply to your account across GRC chat and assessment follow-ups.
      </p>

      {!voiceConfigured && (
        <p style={{ fontSize: 12, color: "var(--rh)", marginBottom: 16, fontFamily: "'Sora', sans-serif" }}>
          Connect ElevenLabs on Vercel to enable AI voice playback and transcription.
        </p>
      )}

      <ToggleRow
        label="Read replies aloud"
        description="Automatically read replies aloud when Nora responds in chat."
        checked={settings.voiceSpeakResponses}
        onChange={value => update({ voiceSpeakResponses: value })}
        disabled={saving}
      />

      <ToggleRow
        label="Prefer voice conversation"
        description="Start in hands-free voice mode — speak your question and hear the reply."
        checked={settings.voiceConversation}
        onChange={value => update({
          voiceConversation: value,
          voiceSpeakResponses: value ? true : settings.voiceSpeakResponses,
        })}
        disabled={saving}
      />

      <ToggleRow
        label="Mic start sound"
        description="Play a short tone when you turn the microphone on in chat or assessments."
        checked={settings.micStartSound}
        onChange={value => {
          update({ micStartSound: value });
          if (value) playVoiceStartSound();
        }}
        disabled={saving}
      />

      <div style={{ paddingTop: 16, borderBottom: "0.5px solid var(--bdr)", paddingBottom: 16 }}>
        <FieldLabel>AI voice</FieldLabel>
        <select
          value={settings.elevenlabsVoiceId}
          onChange={e => update({ elevenlabsVoiceId: e.target.value })}
          disabled={saving || !voiceConfigured}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 7,
            border: "0.5px solid var(--bdr2)",
            background: "var(--card2)",
            color: "var(--fg)",
            fontSize: 13,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {VOICE_OPTIONS.map(voice => (
            <option key={voice.id} value={voice.id}>
              {voice.label} — {voice.description}
            </option>
          ))}
        </select>
      </div>

      <div style={{ paddingTop: 16, borderBottom: "0.5px solid var(--bdr)", paddingBottom: 16 }}>
        <FieldLabel>Speech model</FieldLabel>
        <select
          value={settings.speechModel}
          onChange={e => update({ speechModel: e.target.value })}
          disabled={saving || !voiceConfigured}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 7,
            border: "0.5px solid var(--bdr2)",
            background: "var(--card2)",
            color: "var(--fg)",
            fontSize: 13,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {SPEECH_MODEL_OPTIONS.map(model => (
            <option key={model.id} value={model.id}>
              {model.label} — {model.description}
            </option>
          ))}
        </select>
      </div>

      <div style={{ paddingTop: 16 }}>
        <FieldLabel>Speech speed — {settings.speechSpeed.toFixed(2)}×</FieldLabel>
        <input
          type="range"
          min={0.7}
          max={1.2}
          step={0.05}
          value={settings.speechSpeed}
          onChange={e => update({ speechSpeed: Number(e.target.value) })}
          disabled={saving || !voiceConfigured}
          style={{ width: "100%", accentColor: "var(--red)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--fg4)", fontFamily: "'Sora', sans-serif" }}>
          <span>Slower</span>
          <span>Faster</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, minHeight: 18 }}>
        {saving && (
          <span style={{ fontSize: 11, color: "var(--fg3)", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Sora', sans-serif" }}>
            <Loader2 size={12} className="spin" />
            Saving…
          </span>
        )}
        {!saving && savedAt && (
          <span style={{ fontSize: 11, color: "var(--rl)", fontFamily: "'Sora', sans-serif" }}>
            Saved
          </span>
        )}
        {error && (
          <span style={{ fontSize: 11, color: "var(--rh)", fontFamily: "'Sora', sans-serif" }}>
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
