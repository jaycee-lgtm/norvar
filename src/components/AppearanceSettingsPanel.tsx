"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";
import {
  DEFAULT_USER_AI_SETTINGS,
  fetchUserAiSettings,
  saveUserAiSettings,
  type UserAiSettings,
} from "@/lib/user-ai-settings";
import {
  applyTheme,
  persistThemeLocal,
  THEME_OPTIONS,
  type ThemePreference,
} from "@/lib/theme";

export default function AppearanceSettingsPanel() {
  const [settings, setSettings] = useState<UserAiSettings>(DEFAULT_USER_AI_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchUserAiSettings()
      .then(setSettings)
      .catch(() => setError("Could not load appearance settings."))
      .finally(() => setLoading(false));
  }, []);

  const selectTheme = useCallback(async (themePreference: ThemePreference) => {
    setSettings(prev => ({ ...prev, themePreference }));
    setSaving(true);
    setError("");
    try {
      const next = await saveUserAiSettings({ themePreference });
      setSettings(next);
      persistThemeLocal(next.themePreference);
      applyTheme(next.themePreference);
      setSavedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save appearance settings.");
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 2000);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  return (
    <SettingsSection
      label="Appearance"
      title="Theme"
      description="Choose how Norvar looks on this device. System follows your OS light or dark mode."
      loading={loading}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {THEME_OPTIONS.map(option => {
          const active = settings.themePreference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              onClick={() => void selectTheme(option.value)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 8,
                border: `0.5px solid ${active ? "var(--bdr3)" : "var(--bdr2)"}`,
                background: active ? "var(--lift)" : "var(--card2)",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving && !active ? 0.7 : 1,
                fontFamily: "'Sora', sans-serif",
              }}
            >
              <span style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, marginBottom: 4,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", letterSpacing: "-0.01em" }}>
                  {option.label}
                </span>
                <span style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: `0.5px solid ${active ? "var(--red)" : "var(--bdr2)"}`,
                  background: active ? "var(--red)" : "transparent",
                  flexShrink: 0,
                }} />
              </span>
              <span style={{ fontSize: 12, color: "var(--fg3)", lineHeight: 1.5 }}>
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, minHeight: 18 }}>
        {saving && (
          <span style={{
            fontSize: 11, color: "var(--fg3)", display: "inline-flex",
            alignItems: "center", gap: 6, fontFamily: "'Sora', sans-serif",
          }}>
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
    </SettingsSection>
  );
}
