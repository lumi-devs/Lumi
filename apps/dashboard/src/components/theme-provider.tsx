"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Theme is `system | light | dark`, applied via a `data-theme` attribute on
// <html>. `system` removes the attribute entirely so the `prefers-color-scheme`
// block in globals.css takes over — which means the common case (following
// the OS) paints correctly on the very first frame with no script involved.
//
// This runs client-side after hydration rather than as a blocking inline
// <head> script: next.config.ts ships `script-src 'self'` with no
// 'unsafe-inline'/nonce in production, and a nonce-per-request setup would add
// real complexity. The residual tradeoff is a one-frame flash *only* for users
// who explicitly pinned a theme opposite to their OS setting.

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "lumi-dashboard-theme";

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value);
}

function applyTheme(theme: Theme): void {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset["theme"] = theme;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** False until the stored preference has been read, so the toggle can avoid a hydration mismatch. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => undefined,
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) {
      setThemeState(stored);
      applyTheme(stored);
    }
    setReady(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    const commit = () => {
      setThemeState(next);
      applyTheme(next);
      window.localStorage.setItem(STORAGE_KEY, next);
    };
    // `applyTheme` is a plain DOM mutation (not React-managed), so the
    // browser can capture it as-is for the transition - no flushSync needed.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof document.startViewTransition !== "function") {
      commit();
      return;
    }
    document.startViewTransition(commit);
  }, []);

  return (
    <ThemeContext value={{ theme, setTheme, ready }}>{children}</ThemeContext>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
