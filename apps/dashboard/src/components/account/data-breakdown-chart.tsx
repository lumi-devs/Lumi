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
          <div key={moduleName} className="flex items-center gap-3">
            <span
              title={moduleName}
              className="w-28 shrink-0 truncate text-xs font-medium text-fg-muted"
            >
              {moduleName}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-r-[4px] bg-bg-subtle">
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
            <span className="w-10 shrink-0 text-right font-mono text-[13px] text-fg-subtle tabular-nums">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
