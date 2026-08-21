import { describe, it, expect } from "vitest";
import type { User } from "discord.js";
import { hasAdvertisingIndicators } from "#modules/security/lib/join-heuristics.js";

function user(globalName: string | null, username = "member"): User {
  return { globalName, username } as User;
}

describe("hasAdvertisingIndicators", () => {
  it("flags a discord invite link in the display name", () => {
    expect(hasAdvertisingIndicators(user("join discord.gg/freenitro"))).toBe(true);
  });

  it("flags a bare URL in the display name", () => {
    expect(hasAdvertisingIndicators(user("free steam gifts: https://steamgift.example"))).toBe(true);
  });

  it("flags a www-prefixed domain in the display name", () => {
    expect(hasAdvertisingIndicators(user("www.crypto-airdrop.example"))).toBe(true);
  });

  it("falls back to username when globalName is unset", () => {
    expect(hasAdvertisingIndicators(user(null, "t.me/scamchannel"))).toBe(true);
  });

  it("does not flag an ordinary display name", () => {
    expect(hasAdvertisingIndicators(user("Alex"))).toBe(false);
  });
});
