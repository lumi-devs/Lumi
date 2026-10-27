import { describe, expect, it } from "vitest";
import {
  levelForTotalXp,
  levelProgress,
  totalXpForLevel,
  xpForLevel,
} from "../../modules/community/leveling/formulas.ts";

describe("leveling formulas", () => {
  it("returns the configured XP requirement per level", () => {
    expect(xpForLevel("disgaea", 1)).toBe(100);
    expect(xpForLevel("linear", 2)).toBe(120);
    expect(totalXpForLevel("linear", 3)).toBe(220);
  });

  it("maps total XP to the matching level and leftover XP", () => {
    expect(levelForTotalXp("linear", 0)).toEqual({ level: 1, xp: 0 });
    expect(levelForTotalXp("linear", 99)).toEqual({ level: 1, xp: 99 });
    expect(levelForTotalXp("linear", 100)).toEqual({ level: 2, xp: 0 });
  });

  it("computes progress inside the current level", () => {
    expect(levelProgress("linear", 150, 2)).toEqual({
      level: 2,
      xpIntoLevel: 50,
      xpForNext: 70,
      progress: 50 / 120,
    });
  });

  it("never returns NaN when stored level and XP disagree", () => {
    const progress = levelProgress("disgaea", 15, 999);

    expect(Number.isFinite(progress.xpIntoLevel)).toBe(true);
    expect(Number.isFinite(progress.xpForNext)).toBe(true);
    expect(Number.isFinite(progress.progress)).toBe(true);
    expect(progress.xpIntoLevel).toBe(0);
  });

  it("caps progress at the maximum level", () => {
    expect(levelProgress("disgaea", 15, 1000)).toEqual({
      level: 1000,
      xpIntoLevel: 0,
      xpForNext: 0,
      progress: 1,
    });
  });
});
