"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * SVG ring for stat tiles that are really a fraction (module coverage, shard
 * health, quota) — an animated arc reads faster than a bare "4/6". Not for
 * every number; plain digits still win for counts with no natural ceiling.
 */
export function ProgressRing({
  value,
  size = 56,
  strokeWidth = 6,
  label,
}: {
  /** 0-100. Values outside that range are clamped. */
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border-soft)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset: circumference * (1 - clamped / 100),
          }}
          transition={
            reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }
          }
        />
      </svg>
      {label ? (
        <span className="tabular absolute font-mono text-[13px] font-semibold text-fg">
          {label}
        </span>
      ) : null}
    </div>
  );
}
