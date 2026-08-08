import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";
import { Card } from "#/components/ui/card";

export interface Stat {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Optional status tint for the value (e.g. maintenance mode). */
  tone?: "default" | "success" | "warning" | "danger";
  /** Optional delta vs. a prior period, rendered next to the value. */
  trend?: { direction: "up" | "down"; value: string };
}

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  default: "text-fg",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const TREND_TONE: Record<"up" | "down", string> = {
  up: "text-success",
  down: "text-danger",
};

export function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {stats.map((s) => (
        <Card
          key={s.label}
          className="px-3.5 py-3 transition-colors hover:border-border-strong hover:bg-surface-hover"
        >
          <dt className="font-display flex items-center gap-2 text-[11px] font-semibold tracking-[0.09em] text-fg-subtle uppercase">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg-muted">
              <s.icon className="size-3" aria-hidden />
            </span>
            <span className="truncate">{s.label}</span>
          </dt>
          <dd
            className={cn(
              "font-display tabular mt-1 flex items-baseline gap-1.5 text-[19px] leading-6 font-semibold",
              TONE[s.tone ?? "default"],
            )}
            title={String(s.value)}
          >
            <span className="truncate">{s.value}</span>
            {s.trend ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium",
                  TREND_TONE[s.trend.direction],
                )}
              >
                {s.trend.direction === "up" ? (
                  <ArrowUp className="size-3" aria-hidden />
                ) : (
                  <ArrowDown className="size-3" aria-hidden />
                )}
                {s.trend.value}
              </span>
            ) : null}
          </dd>
        </Card>
      ))}
    </dl>
  );
}
