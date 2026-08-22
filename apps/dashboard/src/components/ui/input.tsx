"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
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
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlBase, "h-auto min-h-16 py-1.5 leading-5", className)}
      {...props}
    />
  );
}

// Radix reserves an empty-string Item value to mean "no selection", but
// several call sites use value="" for an "Any / None / Select…" placeholder
// option - map it to a sentinel at the Radix boundary only, so every call
// site can keep passing plain <option value=""> children unchanged.
const EMPTY_VALUE = "__lumi_select_empty__";
const toRadixValue = (v: string) => (v === "" ? EMPTY_VALUE : v);
const fromRadixValue = (v: string) => (v === EMPTY_VALUE ? "" : v);

interface ParsedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

function parseOptions(children: React.ReactNode): ParsedOption[] {
  const options: ParsedOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child)) return;
    if (child.type !== "option") return;
    options.push({
      value: String(child.props.value ?? ""),
      label: child.props.children,
      disabled: child.props.disabled,
    });
  });
  return options;
}

export function Select({
  id,
  name,
  value,
  defaultValue,
  disabled,
  onChange,
  className,
  children,
  ...rest
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: (event: { target: { value: string } }) => void;
  className?: string;
  children: React.ReactNode;
} & Omit<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  "value" | "defaultValue" | "disabled" | "className" | "id" | "asChild"
>) {
  const options = React.useMemo(() => parseOptions(children), [children]);

  return (
    <SelectPrimitive.Root
      value={value !== undefined ? toRadixValue(value) : undefined}
      defaultValue={defaultValue !== undefined ? toRadixValue(defaultValue) : undefined}
      disabled={disabled}
      name={name}
      onValueChange={(v) => onChange?.({ target: { value: fromRadixValue(v) } })}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          controlBase,
          "flex items-center justify-between gap-2",
          "data-[state=open]:border-accent data-[state=open]:bg-surface",
          className,
        )}
        {...rest}
      >
        <SelectPrimitive.Value className="min-w-0 truncate text-left" />
        <SelectPrimitive.Icon className="shrink-0">
          <ChevronDown className="size-3.5 text-fg-subtle" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-panel border border-border bg-surface p-1 shadow-e3"
        >
          <SelectPrimitive.Viewport className="max-h-64 overflow-y-auto">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={toRadixValue(opt.value)}
                disabled={opt.disabled}
                className={cn(
                  "relative flex cursor-pointer scroll-my-1 items-center gap-2 rounded-control px-2.5 py-2",
                  "text-[15px] text-fg-muted outline-none select-none",
                  "data-highlighted:bg-surface-hover data-highlighted:text-fg",
                  "data-[state=checked]:font-medium data-[state=checked]:text-fg",
                  "data-disabled:pointer-events-none data-disabled:opacity-50",
                )}
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ml-auto flex shrink-0 items-center">
                  <Check className="size-3.5 text-accent-fg" aria-hidden />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
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

// Description-left / control-right. Use when the control is small (a switch, a
// short enum) and the explanation is the long part.
export function SettingRow({
  label,
  htmlFor,
  description,
  control,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  control: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-6 px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="block text-[15px] leading-5 tracking-[0.01em]">
          {label}
        </Label>
        {description ? (
          <p className="mt-0.5 text-[14px] leading-5 text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex w-full max-w-[15rem] shrink-0 justify-end pt-0.5">
        {control}
      </div>
    </div>
  );
}
