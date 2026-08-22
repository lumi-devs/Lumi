import type { LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  meta,
  icon: Icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  /** Glass-tinted icon tile, matching Glyph's tile pattern - most page headers had none at all. */
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 pb-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-accent-soft text-accent-fg">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="font-display text-[19px] leading-6 font-semibold tracking-[0.01em] text-fg">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-[14px] leading-5 text-fg-muted">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-1.5">{meta}</div> : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
