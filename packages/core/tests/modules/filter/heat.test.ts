import { describe, it, expect } from "vitest";
import {
  decayHeat,
  heatAction,
  secondsUntilCool,
  
} from "#modules/filter/lib/heat.js";

const config = {
  enabled: true,
  perMessage: 1,
  perMention: 3,
  perDuplicate: 5,
  perFilterHit: 10,
  decayPerMinute: 10,
  warnAt: 15,
  timeoutAt: 30,
  quarantineAt: 50,
  timeoutMinutes: 10,
};

describe("decayHeat", () => {
  it("bleeds off decayPerMinute for each elapsed minute", () => {
    const now = 600_000;
    expect(decayHeat(30, now - 60_000, now, config.decayPerMinute)).toBe(20);
    expect(decayHeat(30, now - 120_000, now, 10)).toBe(10);
  });

  it("never goes negative", () => {
    const now = 600_000;
    expect(decayHeat(5, now - 600_000, now, 10)).toBe(0);
  });

  it("with zero decay keeps the stored value", () => {
    expect(decayHeat(42, 0, 999_999, 0)).toBe(42);
  });
});

describe("heatAction", () => {
  it("escalates most-severe-first", () => {
    expect(heatAction(5, config as any)).toBe("none");
    expect(heatAction(15, config as any)).toBe("warn");
    expect(heatAction(30, config as any)).toBe("timeout");
    expect(heatAction(50, config as any)).toBe("quarantine");
  });

  it("treats a zero threshold as disabled", () => {
    const noQuarantine = { ...config, quarantineAt: 0 };
    expect(heatAction(999, noQuarantine as any)).toBe("timeout");
  });
});

describe("secondsUntilCool", () => {
  it("scales with heat and adds a grace buffer", () => {
    expect(secondsUntilCool(30, 10)).toBe(180 + 60);
  });

  it("falls back to an hour when decay is disabled", () => {
    expect(secondsUntilCool(30, 0)).toBe(3600);
  });
});
