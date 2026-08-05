import type { LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";

export interface Stat {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Optional status tint for the value (e.g. maintenance mode). */
  tone?: "default" | "success" | "warning" | "danger";
}

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  default: "text-fg",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * Summary strip. Previously four separate 24px-padded glass cards with a
 * 20px emoji above a 24px number — a lot of screen for four short facts.
 * Now one bordered container with hairline-divided cells: label first (you
 * scan labels, not numbers), value second, at a size that doesn't out-shout
 * the form beneath it.
 */
export function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-4 sm:divide-x">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "px-3.5 py-3",
            // 2-col mobile / 4-col desktop: keep the internal rules tidy.
            i % 2 === 1 && "border-l border-border sm:border-l-0",
            i >= 2 && "border-t border-border sm:border-t-0",
          )}
        >
          <dt className="font-display flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.09em] text-fg-subtle uppercase">
            <s.icon className="size-3" aria-hidden />
            <span className="truncate">{s.label}</span>
          </dt>
          <dd
            className={cn(
              "font-display tabular mt-1 truncate text-[19px] leading-6 font-semibold",
              TONE[s.tone ?? "default"],
            )}
            title={String(s.value)}
          >
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
