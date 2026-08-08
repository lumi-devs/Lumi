"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { motion } from "motion/react";
import { cn } from "#/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

// "On" uses the accent, not green: green is reserved for machine status, so a
// toggle's colour never competes with a health indicator.
export function Switch({
  checked,
  onChange,
  disabled,
  className,
  ...aria
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        checked
          ? "border-transparent bg-accent"
          : "border-border bg-bg-subtle hover:border-border-strong",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        className,
      )}
      {...aria}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          className={cn(
            "pointer-events-none inline-block size-3.5 rounded-full",
            checked ? "bg-white" : "bg-fg-subtle",
          )}
          animate={{ x: checked ? 18 : 3 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

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
