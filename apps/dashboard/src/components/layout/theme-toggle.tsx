"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useTheme, type Theme } from "#/components/theme-provider";
import { cn } from "#/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System theme", icon: Monitor },
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
];

export function ThemeToggle() {
  const { theme, setTheme, ready } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-px rounded-full border border-border bg-bg-subtle p-px"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = ready && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "relative flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors",
              selected ? "text-fg" : "text-fg-subtle hover:text-fg",
            )}
          >
            {selected ? (
              <motion.span
                layoutId="theme-toggle-pill"
                className="absolute inset-0 rounded-full bg-surface"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            ) : null}
            <Icon className="relative z-10 size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
