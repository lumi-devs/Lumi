"use client";

import { cn } from "#/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Plain checkbox styled as a toggle — no Radix dependency needed for this
 * scope. Sized to 20px so it sits inside a 32px dense row, and "on" uses the
 * accent rather than green: green is reserved for *status* (a module is
 * running) so a toggle's colour never competes with a health indicator.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  className,
  ...aria
}: SwitchProps) {
  return (
    <label
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        checked
          ? "border-transparent bg-accent"
          : "border-border bg-bg-subtle hover:border-border-strong",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ring)]",
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        {...aria}
      />
      <span
        className={cn(
          "pointer-events-none inline-block size-3.5 rounded-full shadow-e1 transition-transform",
          checked ? "translate-x-[1.125rem] bg-white" : "translate-x-[3px] bg-fg-subtle",
        )}
      />
    </label>
  );
}

/** Checkbox for explicit confirmations (destructive flows). */
export function Checkbox({
  checked,
  onChange,
  disabled,
  className,
  ...aria
}: SwitchProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className={cn(
        "size-3.5 shrink-0 cursor-pointer rounded-[4px] border border-border-strong bg-bg-subtle",
        "accent-[var(--accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...aria}
    />
  );
}
