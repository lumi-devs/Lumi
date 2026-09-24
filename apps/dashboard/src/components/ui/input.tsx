"use client";

import * as React from "react";
import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

// Controls are 32px, matching the button scale so a control + button row lines up.

const controlBase = [
  "h-8 w-full rounded-control border border-border bg-bg-subtle px-2.5",
  "text-[15px] text-fg placeholder:text-fg-subtle",
  "transition-colors outline-none",
  "hover:border-border-strong",
  "focus:border-accent focus:bg-surface",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input data-slot="input" className={cn(controlBase, className)} {...props} />;
}

export function Textarea({
  className,
  ref,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: React.Ref<HTMLTextAreaElement>;
}) {
  return (
    <textarea
      ref={ref}
      className={cn(controlBase, "h-auto min-h-16 py-1.5 leading-5", className)}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "font-display text-[14px] leading-4 font-semibold tracking-[0.02em] text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-[13px] leading-4 text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/** The explanation as a hover/focus tooltip on a `?` beside the label, for
 * surfaces where a whole column of near-identical descriptions is noise. */
export function HintTooltip({
  hint,
  name,
}: {
  hint: React.ReactNode;
  name: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={name}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-none"
          >
            <CircleHelp aria-hidden className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs px-3 py-2.5 text-[13px] leading-5">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Description-left / control-right. Use when the control is small (a switch, a
// short enum) and the explanation is the long part. `wide` stacks the control
// under the description instead, for editors that need the whole row. Pass
// `hint` instead of `description` to fold the explanation into a `?` tooltip.
export function SettingRow({
  label,
  htmlFor,
  description,
  hint,
  control,
  className,
  wide,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  hint?: React.ReactNode;
  control: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const heading = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor} className="block text-[15px] leading-5 tracking-[0.01em]">
          {label}
        </Label>
        {hint ? (
          <HintTooltip
            hint={hint}
            name={typeof label === "string" ? `About ${label}` : "More information"}
          />
        ) : null}
      </div>
      {description ? (
        <p className="mt-0.5 text-[14px] leading-5 text-fg-muted">
          {description}
        </p>
      ) : null}
    </div>
  );

  if (wide) {
    return (
      <div className={cn("flex flex-col gap-2.5 px-4 py-3", className)}>
        {heading}
        <div className="w-full">{control}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-6 px-4 py-3",
        className,
      )}
    >
      {heading}
      <div className="flex w-full max-w-[15rem] shrink-0 justify-end pt-0.5">
        {control}
      </div>
    </div>
  );
}
