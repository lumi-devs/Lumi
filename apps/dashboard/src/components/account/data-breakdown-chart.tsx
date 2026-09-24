"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Horizontal magnitude bars for the GDPR export summary - one series (record
 * count), so no legend needed; the count is direct-labeled at each bar's tip,
 * which doubles as the accessible text alternative to the visual bar itself.
 */
export function DataBreakdownChart({ data }: { data: Record<string, number> }) {
  const reduce = useReducedMotion();
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(([moduleName, count], index) => {
        const pct = (count / max) * 100;
        return (
          <div
            key={moduleName}
            className="grid items-center gap-3 grid-cols-[minmax(0,14rem)_minmax(0,1fr)_2.5rem]"
          >
            <span
              title={moduleName}
              className="truncate text-xs font-medium text-fg-muted"
            >
              {moduleName}
            </span>
            <div className="h-2.5 max-w-lg overflow-hidden rounded-r-[4px] bg-bg-subtle">
              <motion.div
                className="h-full rounded-r-[4px] bg-accent"
                initial={{ width: reduce ? `${pct}%` : 0 }}
                animate={{ width: `${pct}%` }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }
                }
              />
            </div>
            <span className="text-right font-mono text-[13px] text-fg-subtle tabular-nums">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
