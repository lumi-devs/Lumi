import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "#/lib/utils";

const badgeVariants = cva(
  "font-display inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-[11px] leading-4 font-semibold tracking-[0.03em] whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border bg-bg-subtle text-fg-muted",
        outline: "border-border text-fg-muted",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        danger: "border-transparent bg-danger-soft text-danger",
        accent: "border-transparent bg-accent-soft text-accent-fg",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? (
        <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}

export function StatusDot({
  active,
  className,
  title,
}: {
  active: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      data-slot="status-dot"
      title={title}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        active ? "bg-success" : "bg-border-strong",
        className,
      )}
    />
  );
}
