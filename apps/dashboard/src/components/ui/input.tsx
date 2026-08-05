import { ChevronDown } from "lucide-react";
import { cn } from "#/lib/utils";

// Controls are 32px tall, not 40px. On a config screen with twelve fields
// that is roughly a hundred vertical pixels of scrolling saved per screen,
// and it matches the button scale so a control + button row lines up.

const controlBase = [
  "h-8 w-full rounded-md border border-border bg-bg-subtle px-2.5",
  "text-[13px] text-fg placeholder:text-fg-subtle",
  "transition-colors outline-none",
  "hover:border-border-strong",
  "focus:border-accent focus:bg-surface",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, className)} {...props} />;
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

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(controlBase, "appearance-none pr-8", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "font-display text-[12px] leading-4 font-semibold tracking-[0.02em] text-fg",
        className,
      )}
      {...props}
    />
  );
}

/** Stacked label → control → hint. The default for form grids. */
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
      {hint ? <p className="text-[11px] leading-4 text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/**
 * Description-left / control-right row, the layout Discord's own settings and
 * Linear both use. Reads far faster than label-above-input when the control is
 * small (a switch, a short enum) and the explanation is the long part.
 */
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
        <Label htmlFor={htmlFor} className="block text-[13px] leading-5 tracking-[0.01em]">
          {label}
        </Label>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">
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
