import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";
import { Card } from "#/components/ui/card";
import { StatCountUp } from "#/components/stat-count-up";

export interface Stat {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** Small trailing unit next to the value ("ms", "/ 12"). */
  unit?: string;
  /** Optional status tint for the value (e.g. maintenance mode). */
  tone?: "default" | "success" | "warning" | "danger";
  /** Optional delta vs. a prior period, rendered next to the value. */
  trend?: { direction: "up" | "down"; value: string };
  /** Counts up from 0 on mount instead of appearing static - use only for real numbers (member/case/blocklist totals), never padding. */
  countUp?: boolean;
}

function StatValue({ stat }: { stat: Stat }) {
  if (stat.countUp && typeof stat.value === "number") {
    return <StatCountUp value={stat.value} />;
  }
  return <>{stat.value}</>;
}

const Tone: Record<NonNullable<Stat["tone"]>, string> = {
  default: "text-fg",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const TrendTone: Record<"up" | "down", string> = {
  up: "text-success",
  down: "text-danger",
};

export function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {stats.map((s) => (
        <Card
          key={s.label}
          className="px-4 pt-3.5 pb-3.5 transition-colors hover:border-border-strong"
        >
          <dt className="font-display flex items-center gap-2 text-[13px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
            {s.icon ? (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg-muted">
                <s.icon className="size-3" aria-hidden />
              </span>
            ) : null}
            <span className="truncate">{s.label}</span>
          </dt>
          <dd
            className={cn(
              "tabular mt-2.5 flex items-baseline gap-1.5 font-mono text-[28px] leading-7 font-semibold",
              Tone[s.tone ?? "default"],
            )}
            title={String(s.value)}
          >
            <span className="truncate">
              <StatValue stat={s} />
            </span>
            {s.unit ? (
              <span className="shrink-0 text-[15px] font-normal text-fg-subtle">
                {s.unit}
              </span>
            ) : null}
            {s.trend ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium",
                  TrendTone[s.trend.direction],
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
