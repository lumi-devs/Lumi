import { describe, it, expect } from "bun:test";
import {
  levelForTotalXp,
  totalXpForLevel,
  xpForLevel,
} from "#src/modules/leveling/services/Formulas.js";
import { applyMultipliers } from "#src/modules/leveling/Config.js";
import type { LevelingConfig } from "#src/modules/leveling/Config.js";

function baseConfig(overrides: Partial<LevelingConfig> = {}): LevelingConfig {
  return {
    formula: "disgaea",
    messageXp: 15,
    messageCooldownMs: 60000,
    minMessageLength: 4,
    voiceEnabled: true,
    voiceXpPerMinute: 4,
    announceEnabled: true,
    announceChannelId: null,
    announceMessage: "{user} reached level {level}!",
    ignoredChannels: [],
    ignoredRoles: [],
    levelRewards: [],
    roleStack: true,
    keepXpOnLeave: true,
    globalMultiplier: 1,
    roleMultipliers: [],
    channelMultipliers: [],
    ...overrides,
  };
}

describe("xpForLevel", () => {
  it("disgaea starts at 100 and grows cubically", () => {
    expect(xpForLevel("disgaea", 1)).toBe(100);
    expect(xpForLevel("disgaea", 2)).toBe(103);
    expect(xpForLevel("disgaea", 10)).toBe(212);
  });

  it("fibonacci uses 100 plus fib(level)", () => {
    expect(xpForLevel("fibonacci", 1)).toBe(100);
    expect(xpForLevel("fibonacci", 2)).toBe(101);
    expect(xpForLevel("fibonacci", 7)).toBe(113);
  });

  it("linear adds 20 per level", () => {
    expect(xpForLevel("linear", 1)).toBe(100);
    expect(xpForLevel("linear", 2)).toBe(120);
    expect(xpForLevel("linear", 5)).toBe(180);
  });

  it("mee6 matches the MEE6 curve", () => {
    expect(xpForLevel("mee6", 1)).toBe(100);
    expect(xpForLevel("mee6", 2)).toBe(155);
    expect(xpForLevel("mee6", 3)).toBe(220);
  });

  it("atlas starts at 55", () => {
    expect(xpForLevel("atlas", 1)).toBe(55);
    expect(xpForLevel("atlas", 2)).toBe(85);
  });

  it("arcane starts at 75 and adds 100 per level", () => {
    expect(xpForLevel("arcane", 1)).toBe(75);
    expect(xpForLevel("arcane", 2)).toBe(175);
  });

  it("lurkr uses 100 then 50 plus 100 per level", () => {
    expect(xpForLevel("lurkr", 1)).toBe(100);
    expect(xpForLevel("lurkr", 2)).toBe(50);
    expect(xpForLevel("lurkr", 3)).toBe(150);
  });

  it("clamps levels below 1 to 1", () => {
    expect(xpForLevel("mee6", 0)).toBe(100);
  });
});

describe("totalXpForLevel / levelForTotalXp", () => {
  it("level 1 needs zero total XP", () => {
    expect(totalXpForLevel("mee6", 1)).toBe(0);
    expect(totalXpForLevel("mee6", 2)).toBe(100);
    expect(totalXpForLevel("mee6", 3)).toBe(255);
  });

  it("round-trips totals back to level and progress", () => {
    expect(levelForTotalXp("mee6", 0)).toEqual({ level: 1, xp: 0 });
    expect(levelForTotalXp("mee6", 100)).toEqual({ level: 2, xp: 0 });
    expect(levelForTotalXp("mee6", 254)).toEqual({ level: 2, xp: 154 });
    expect(levelForTotalXp("mee6", 255)).toEqual({ level: 3, xp: 0 });
  });
});

describe("applyMultipliers", () => {
  it("returns base when no multipliers apply", () => {
    expect(applyMultipliers(15, baseConfig(), ["1"], "2")).toBe(15);
  });

  it("stacks global, best role, and channel multipliers", () => {
    const config = baseConfig({
      globalMultiplier: 2,
      roleMultipliers: [
        { id: "10", mult: 2 },
        { id: "11", mult: 3 },
      ],
      channelMultipliers: [{ id: "20", mult: 1.5 }],
    });
    expect(applyMultipliers(15, config, ["10", "11"], "20")).toBe(135);
  });

  it("ignores non-matching roles and channels", () => {
    const config = baseConfig({
      roleMultipliers: [{ id: "10", mult: 5 }],
      channelMultipliers: [{ id: "20", mult: 5 }],
    });
    expect(applyMultipliers(15, config, ["99"], "98")).toBe(15);
  });

  it("floors fractional results to at least 1", () => {
    const config = baseConfig({ globalMultiplier: 0.1 });
    expect(applyMultipliers(15, config, [], null)).toBe(1);
  });
});
