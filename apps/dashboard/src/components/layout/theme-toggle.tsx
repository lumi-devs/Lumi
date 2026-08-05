"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "#/components/theme-provider";
import { cn } from "#/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System theme", icon: Monitor },
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
];

/**
 * Segmented system/light/dark control. The old multi-theme engine
 * ("midnight"/"oled"/"cyberpunk") had no UI at all and no light mode, so in
 * practice the app was dark-only with two unreachable novelty palettes.
 */
export function ThemeToggle() {
  const { theme, setTheme, ready } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-px rounded-md border border-border bg-bg-subtle p-px"
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
              "flex size-6 cursor-pointer items-center justify-center rounded-[5px] transition-colors",
              selected
                ? "bg-surface text-fg shadow-e1"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
