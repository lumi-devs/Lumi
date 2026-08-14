import { cn } from "#/lib/utils";

// Padding lives on the sections, not the shell, so a section can be a
// full-bleed table or a divided list.

export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** Hover lift + accent glow, for cards that are themselves a clickable/navigable unit (not a static data panel). */
  interactive?: boolean;
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        "overflow-hidden rounded-panel border border-border bg-surface transition-[transform,box-shadow,border-color] duration-fast",
        interactive &&
          "hover:-translate-y-px hover:border-border-strong hover:shadow-glow-accent",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  children,
  actions,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { actions?: React.ReactNode }) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex items-start gap-3 border-b border-border px-4 py-3",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>
      ) : null}
    </div>
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "font-display text-[14px] leading-5 font-semibold tracking-[0.01em] text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="card-description"
      className={cn("mt-0.5 text-[12px] leading-5 text-fg-muted", className)}
      {...props}
    />
  );
}

// `<CardBody className="p-0">` for tables and divided lists.
export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn("p-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-2 border-t border-border bg-bg-subtle px-4 py-2.5 text-[12px] text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
