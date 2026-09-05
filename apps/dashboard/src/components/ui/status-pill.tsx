import { cn } from "#/lib/utils";

export type StatusTone = "good" | "warn" | "bad" | "neutral";

const Dot: Record<StatusTone, string> = {
  good: "bg-success shadow-[0_0_6px_var(--success)]",
  warn: "bg-warning shadow-[0_0_6px_var(--warning)]",
  bad: "bg-danger shadow-[0_0_6px_var(--danger)]",
  neutral: "bg-fg-subtle",
};

export function StatusPill({
  tone = "neutral",
  label,
  value,
  className,
}: {
  tone?: StatusTone;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1.5 font-mono text-[13px] text-fg-muted",
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", Dot[tone])} />
      {label}
      <strong className="tabular font-semibold text-fg">{value}</strong>
    </span>
  );
}

export function StatusStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}
