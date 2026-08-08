import type { LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";

// The one empty state for the whole app: a bordered icon tile (never a bare
// emoji), one sentence of what's missing, one of what to do, optional action.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  footnote,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footnote?: React.ReactNode;
  className?: string;
  /** Inline variant for inside a card body or table shell. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-6 py-10" : "gap-3 px-6 py-16",
        className,
      )}
    >
      <div className="flex size-9 items-center justify-center rounded-control border border-border bg-bg-subtle text-fg-subtle">
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="max-w-sm">
        <p className="font-display text-[14px] font-semibold tracking-[0.01em] text-fg">
          {title}
        </p>
        {description ? (
          <p className="mt-1 text-[12px] leading-5 text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1 flex gap-2">{action}</div> : null}
      {footnote ? (
        <p className="mt-1 font-mono text-[11px] text-fg-subtle">{footnote}</p>
      ) : null}
    </div>
  );
}
