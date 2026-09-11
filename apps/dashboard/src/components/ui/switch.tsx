"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "#/lib/utils";

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

// "On" uses the accent, not green: green is reserved for machine status, so a
// toggle's colour never competes with a health indicator.
export function Switch({
  id,
  checked,
  onChange,
  disabled,
  className,
  ...aria
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
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
        <span
          className={cn(
            "pointer-events-none inline-block size-3.5 rounded-full transition-colors",
            checked ? "bg-white" : "bg-fg-subtle",
          )}
          style={{
            transform: `translateX(${checked ? 18 : 3}px)`,
            transition: "transform 150ms ease-out",
          }}
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
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border transition-colors",
        checked
          ? "border-transparent bg-accent text-white"
          : "border-border-strong bg-bg-subtle hover:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        className,
      )}
      {...aria}
    >
      {checked ? <Check aria-hidden className="size-3" /> : null}
    </button>
  );
}
