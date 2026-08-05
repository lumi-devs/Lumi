import { cn } from "#/lib/utils";

/**
 * Every page previously hand-rolled its own title block with slightly
 * different type sizes and margins. This is the single one: 15px semibold
 * title, 12px muted subtitle, right-aligned actions, one shared bottom rule.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned page-level actions. */
  actions?: React.ReactNode;
  /** Optional line under the title — IDs, counts, breadcrumb-ish context. */
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4",
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
