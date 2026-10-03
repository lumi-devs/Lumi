import { describe, it, expect } from "bun:test";
import { fnv1aHash, rolloutBucket } from "#lib/feature-flags/hash.js";

describe("fnv1aHash", () => {
  it("is deterministic for the same input", () => {
    expect(fnv1aHash("new-ui:12345")).toBe(fnv1aHash("new-ui:12345"));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const input of ["a", "lumi:flags:eval:x", "", "🙂"]) {
      const hash = fnv1aHash(input);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("differs for different inputs (no trivial collisions across a small set)", () => {
    const hashes = new Set(
      Array.from({ length: 200 }, (_, i) => fnv1aHash(`flag:${i}`)),
    );
    expect(hashes.size).toBe(200);
  });
});

describe("rolloutBucket", () => {
  it("is deterministic for the same (key, guild) pair", () => {
    expect(rolloutBucket("new-ui", "111111111111111111")).toBe(
      rolloutBucket("new-ui", "111111111111111111"),
    );
  });

  it("always lands in [0, 100)", () => {
    for (let i = 0; i < 500; i++) {
      const bucket = rolloutBucket("flag", `guild-${i}`);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it("treats a missing guild as a stable 'global' subject", () => {
    expect(rolloutBucket("flag", null)).toBe(rolloutBucket("flag", null));
    expect(rolloutBucket("flag", null)).not.toBe(rolloutBucket("flag", "global-ish"));
  });

  it("distributes roughly uniformly across buckets over many guilds", () => {
    const buckets = new Array(100).fill(0);
    const sampleSize = 20_000;
    for (let i = 0; i < sampleSize; i++) {
      buckets[rolloutBucket("distribution-flag", `guild-${i}`)]++;
    }
    const expected = sampleSize / 100;
    const maxDeviation = Math.max(...buckets.map((count) => Math.abs(count - expected)));
    // Generous bound - this asserts "not wildly skewed", not a strict chi-square test.
    expect(maxDeviation).toBeLessThan(expected * 0.5);
  });

  it("gives different flag keys independent bucket assignments for the same guild", () => {
    const guildId = "222222222222222222";
    const a = rolloutBucket("flag-a", guildId);
    const b = rolloutBucket("flag-b", guildId);
    const c = rolloutBucket("flag-c", guildId);
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
});
