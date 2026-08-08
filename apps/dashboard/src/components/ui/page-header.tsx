import { cn } from "#/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-[17px] leading-6 font-semibold tracking-[0.01em] text-fg">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 max-w-2xl text-[12px] leading-5 text-fg-muted">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-1.5">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
