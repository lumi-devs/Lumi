import { AlertTriangle, CircleAlert, Info, type LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "#/lib/utils";

const alertVariants = cva(
  "flex items-start gap-2 rounded-control border px-2.5 py-2 text-[14px] leading-5",
  {
    variants: {
      variant: {
        info: "border-border bg-bg-subtle text-fg-muted",
        warning: "border-warning/25 bg-warning-soft text-warning",
        danger: "border-danger/25 bg-danger-soft text-danger",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const DEFAULT_ICON: Record<string, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  danger: CircleAlert,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: LucideIcon | null;
}

export function Alert({
  className,
  variant,
  icon,
  children,
  ...props
}: AlertProps) {
  const Icon = icon === null ? null : (icon ?? DEFAULT_ICON[variant ?? "info"]!);
  return (
    <div
      data-slot="alert"
      role={variant === "danger" ? "alert" : undefined}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {Icon ? <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
