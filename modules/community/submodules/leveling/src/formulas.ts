import { MaxLevel } from "./constants.js";

export const LevelFormulas = [
  "disgaea",
  "fibonacci",
  "linear",
  "mee6",
  "atlas",
  "arcane",
  "lurkr",
] as const;

export type LevelFormula = (typeof LevelFormulas)[number];

export function isLevelFormula(value: unknown): value is LevelFormula {
  return (
    typeof value === "string" &&
    (LevelFormulas as readonly string[]).includes(value)
  );
}

function fib(n: number): number {
  let a = 0;
  let b = 1;
  for (let i = 0; i < n; i++) {
    const next = a + b;
    a = b;
    b = next;
  }
  return a;
}

export function xpForLevel(formula: LevelFormula, level: number): number {
  const lv = Math.max(1, Math.floor(level));
  switch (formula) {
    case "disgaea": {
      const t = lv - 1;
      return Math.floor(
        100 + 0.04 * t * t * t + 0.8 * t * t + 2 * t + 0.5,
      );
    }
    case "fibonacci":
      if (lv === 1) return 100;
      return Math.floor(100 + fib(lv));
    case "linear":
      return 100 + 20 * (lv - 1);
    case "mee6":
      return 5 * (lv - 1) * (lv - 1) + 50 * (lv - 1) + 100;
    case "atlas":
      if (lv === 1) return 55;
      return (
        (5 * lv * lv + 50) * lv - (5 * (lv - 1) * (lv - 1) + 50) * (lv - 1)
      );
    case "arcane":
      return 100 * (lv - 1) + 75;
    case "lurkr":
      if (lv === 1) return 100;
      return 50 + 100 * (lv - 2);
  }
}

export function totalXpForLevel(formula: LevelFormula, level: number): number {
  let total = 0;
  for (let lv = 1; lv < Math.min(level, MaxLevel); lv++) {
    total += xpForLevel(formula, lv);
  }
  return total;
}

export function levelForTotalXp(
  formula: LevelFormula,
  total: number,
): { level: number; xp: number } {
  let remaining = Math.max(0, Math.floor(total));
  let level = 1;
  while (level < MaxLevel) {
    const needed = xpForLevel(formula, level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }
  return { level, xp: remaining };
}
