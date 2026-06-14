"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import {
  AI_SETTINGS_EVENT,
  DEFAULT_USER_AI_SETTINGS,
  fetchUserAiSettings,
  type UserAiSettings,
} from "@/lib/user-ai-settings";
import {
  applyTheme,
  persistThemeLocal,
  readThemeLocal,
  type ThemePreference,
} from "@/lib/theme";

function syncTheme(preference: ThemePreference) {
  persistThemeLocal(preference);
  applyTheme(preference);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useUser();

  useEffect(() => {
    let media: MediaQueryList | null = null;
    let onMediaChange: (() => void) | null = null;
    let preference: ThemePreference = readThemeLocal();

    const attachSystemListener = (pref: ThemePreference) => {
      if (media && onMediaChange) {
        media.removeEventListener("change", onMediaChange);
        media = null;
        onMediaChange = null;
      }
      if (pref !== "system") return;
      media = window.matchMedia("(prefers-color-scheme: light)");
      onMediaChange = () => applyTheme("system");
      media.addEventListener("change", onMediaChange);
    };

    const applyPreference = (pref: ThemePreference) => {
      preference = pref;
      syncTheme(pref);
      attachSystemListener(pref);
    };

    applyPreference(preference);

    const onSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<UserAiSettings>).detail;
      if (detail?.themePreference) applyPreference(detail.themePreference);
    };

    window.addEventListener(AI_SETTINGS_EVENT, onSettingsUpdated);

    let cancelled = false;
    if (isSignedIn) {
      void fetchUserAiSettings()
        .then(settings => {
          if (!cancelled) applyPreference(settings.themePreference);
        })
        .catch(() => {
          if (!cancelled) applyPreference(readThemeLocal());
        });
    }

    return () => {
      cancelled = true;
      window.removeEventListener(AI_SETTINGS_EVENT, onSettingsUpdated);
      if (media && onMediaChange) media.removeEventListener("change", onMediaChange);
    };
  }, [isSignedIn]);

  return children;
}
