export type ThemePreference = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "norvar-theme";

export const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
}[] = [
  {
    value:       "dark",
    label:       "Dark",
    description: "Pure black background with cool silver text hierarchy.",
  },
  {
    value:       "light",
    label:       "Light",
    description: "Warm off-white background with ink-toned text.",
  },
  {
    value:       "system",
    label:       "System",
    description: "Follow your device appearance setting.",
  },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

export function resolveTheme(
  preference: ThemePreference,
  prefersLight?: boolean,
): "dark" | "light" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  const light = prefersLight ?? (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  );
  return light ? "light" : "dark";
}

export function applyResolvedTheme(resolved: "dark" | "light") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("light", resolved === "light");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function applyTheme(preference: ThemePreference) {
  applyResolvedTheme(resolveTheme(preference));
}

export function readThemeLocal(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // ignore storage errors
  }
  return "dark";
}

export function persistThemeLocal(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // ignore storage errors
  }
}

/** Inline boot script — prevents light-mode flash before React hydrates. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var light=t==="light"||(t==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches);var r=document.documentElement;if(light){r.classList.add("light");r.dataset.theme="light";r.style.colorScheme="light";}else{r.dataset.theme="dark";r.style.colorScheme="dark";}}catch(e){}})();`;
