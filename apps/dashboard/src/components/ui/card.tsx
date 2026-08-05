import { cn } from "#/lib/utils";

// Flat, bordered panels — no backdrop blur, no translucent "glass", no
// 24px-of-padding-around-two-lines-of-text. An admin panel's job is to fit a
// lot of legible controls on one screen, so the card is a 1px line and a
// surface colour, and padding is per-section rather than on the shell (which
// lets a section be a full-bleed table or a divided list).

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface shadow-e1",
        className,
      )}
      {...props}
    />
  );
}

/** Title row. Pass `actions` for right-aligned controls (toggle, button). */
export function CardHeader({
  className,
  children,
  actions,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { actions?: React.ReactNode }) {
  return (
    <div
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
      className={cn("mt-0.5 text-[12px] leading-5 text-fg-muted", className)}
      {...props}
    />
  );
}

/** Padded body region. Use `<CardBody className="p-0">` for tables/lists. */
export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

/** Muted footer strip — helper text, secondary actions, warnings. */
export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-border bg-bg-subtle px-4 py-2.5 text-[12px] text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
