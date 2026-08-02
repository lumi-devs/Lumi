"use client";

import { useEffect, useState } from "react";

// dashboard.md §6E — Multi-Theme Engine. Applies the stored theme via a
// `data-theme` attribute on <html>, same mechanism the spec calls for.
//
// This runs client-side after hydration rather than as a blocking inline
// <head> script (the more common "avoid flash of wrong theme" trick):
// dashboard.md §5C's CSP intentionally ships `script-src 'self'` with no
// 'unsafe-inline'/nonce in production, and a nonce-per-request setup would
// add real complexity for a cosmetic flash. The tradeoff is a one-frame
// flash of the default (Midnight Space) theme on first paint for visitors
// who previously picked a different theme — acceptable for a self-hosted
// admin tool.

export const THEMES = ["midnight", "oled", "cyberpunk"] as const;
export type Theme = (typeof THEMES)[number];
const STORAGE_KEY = "lumi-dashboard-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.includes(stored as Theme) && stored !== "midnight") {
      document.documentElement.dataset["theme"] = stored;
    }
  }, []);
  return children;
}

export function setTheme(theme: Theme): void {
  if (theme === "midnight") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset["theme"] = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function useCurrentTheme(): Theme {
  const [theme, setThemeState] = useState<Theme>("midnight");
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.includes(stored as Theme)) setThemeState(stored as Theme);
  }, []);
  return theme;
}
