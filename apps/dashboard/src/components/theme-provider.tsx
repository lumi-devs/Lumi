"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const Themes = ["system", "light", "dark"] as const;
export type Theme = (typeof Themes)[number];

const StorageKey = "lumi-dashboard-theme";

function isTheme(value: string | null): value is Theme {
  return value !== null && (Themes as readonly string[]).includes(value);
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
    const stored = window.localStorage.getItem(StorageKey);
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
      window.localStorage.setItem(StorageKey, next);
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
