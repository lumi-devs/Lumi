import { describe, it, expect } from "bun:test";
import {
  DefaultSlotPayouts,
  parseSlotPayouts,
  renderSlotGrid,
  resolveSlotPayout,
  spinSlots,
  type SlotRow,
} from "#modules/economy/lib/slots.js";

describe("slots engine", () => {
  it("keeps Red's jackpot, cherry, and clover combos", () => {
    expect(
      resolveSlotPayout(["two", "two", "six"], 10, DefaultSlotPayouts),
    ).toMatchObject({ key: "jackpot", pay: 500 });
    expect(
      resolveSlotPayout(["cherries", "cherries", "cherries"], 10, DefaultSlotPayouts),
    ).toMatchObject({ key: "cherriesThree", pay: 200 });
    expect(
      resolveSlotPayout(["clover", "clover", "clover"], 10, DefaultSlotPayouts),
    ).toMatchObject({ key: "cloverThree", pay: 250 });
    expect(
      resolveSlotPayout(["two", "six", "cookie"], 10, DefaultSlotPayouts),
    ).toMatchObject({ key: "twoSix", pay: 40 });
    expect(
      resolveSlotPayout(["cookie", "cherries", "cherries"], 10, DefaultSlotPayouts),
    ).toMatchObject({ key: "cherriesTwo", pay: 30 });
  });

  it("falls back to generic three-kind and two-kind payouts", () => {
    expect(
      resolveSlotPayout(["cookie", "cookie", "cookie"], 10, DefaultSlotPayouts),
    ).toMatchObject({ key: "threeKind", pay: 100 });
    expect(
      resolveSlotPayout(["cookie", "cookie", "six"], 10, DefaultSlotPayouts),
    ).toMatchObject({ key: "twoKind", pay: 20 });
  });

  it("returns no payout for a losing row", () => {
    const outcome = resolveSlotPayout(
      ["cookie", "six", "heart"],
      10,
      DefaultSlotPayouts,
    );
    expect(outcome).toMatchObject({ key: null, pay: 0 });
  });

  it("honors configured payout overrides", () => {
    const payouts = parseSlotPayouts(["jackpot:100", "twoKind:5"]);
    expect(payouts.jackpot).toBe(100);
    expect(payouts.twoKind).toBe(5);
    expect(payouts.threeKind).toBe(DefaultSlotPayouts.threeKind);
    expect(
      resolveSlotPayout(["two", "two", "six"], 10, payouts).pay,
    ).toBe(1000);
  });

  it("ignores malformed payout entries", () => {
    const payouts = parseSlotPayouts([
      "jackpot:0",
      "nope:10",
      "threeKind:abc",
      "twoKind:5000",
      42 as never,
    ]);
    expect(payouts).toEqual(DefaultSlotPayouts);
  });

  it("spins three-by-three grids deterministically with injected randomness", () => {
    const spin = spinSlots(() => 0);
    expect(spin.middle).toEqual(["cookie", "cookie", "cookie"] as SlotRow);
    const grid = renderSlotGrid(spin);
    expect(grid.split("\n")).toHaveLength(3);
    expect(grid.split("\n")[1]).toMatch(/^> /);
  });
});
