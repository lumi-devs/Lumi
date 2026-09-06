import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RedisKeys } from "#lib/database/redis.js";
import {
  consumeLogClaimCode,
  dismissLogClaim,
  issueLogClaimCode,
  listLogClaims,
  normalizeLogClaimCode,
  peekLogClaimCode,
  registerLogClaim,
} from "#lib/logging/claims.js";

const GUILD_ID = "123456789012345678";
const ISSUER_ID = "111111111111111111";

function createFakeRedis() {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const setCalls: unknown[][] = [];
  return {
    setCalls,
    strings,
    sets,
    async set(key: string, value: string, ...args: unknown[]) {
      setCalls.push([key, value, ...args]);
      if (args.includes("NX") && strings.has(key)) return null;
      strings.set(key, value);
      return "OK";
    },
    async get(key: string) {
      return strings.get(key) ?? null;
    },
    async getdel(key: string) {
      const value = strings.get(key) ?? null;
      strings.delete(key);
      return value;
    },
    async del(...keys: string[]) {
      let removed = 0;
      for (const key of keys) {
        if (strings.delete(key)) removed++;
      }
      return removed;
    },
    async sadd(key: string, ...members: string[]) {
      let bucket = sets.get(key);
      if (!bucket) {
        bucket = new Set();
        sets.set(key, bucket);
      }
      let added = 0;
      for (const member of members) {
        if (!bucket.has(member)) {
          bucket.add(member);
          added++;
        }
      }
      return added;
    },
    async smembers(key: string) {
      return [...(sets.get(key) ?? [])];
    },
    async srem(key: string, ...members: string[]) {
      const bucket = sets.get(key);
      if (!bucket) return 0;
      let removed = 0;
      for (const member of members) {
        if (bucket.delete(member)) removed++;
      }
      return removed;
    },
    async expire(_key: string, _ttl: number) {
      return 1;
    },
    async mget(...keys: string[]) {
      return keys.map((key) => strings.get(key) ?? null);
    },
  };
}

type FakeRedis = ReturnType<typeof createFakeRedis>;

describe("logging claim store", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = createFakeRedis();
    (container as any).redis = redis;
  });

  describe("normalizeLogClaimCode", () => {
    it("accepts exact codes case-insensitively with surrounding whitespace", () => {
      expect(normalizeLogClaimCode("  ab23cd  ")).toBe("AB23CD");
    });

    it("rejects wrong lengths and ambiguous characters", () => {
      expect(normalizeLogClaimCode("ABC12")).toBeNull();
      expect(normalizeLogClaimCode("ABC1234")).toBeNull();
      expect(normalizeLogClaimCode("AB012C")).toBeNull();
      expect(normalizeLogClaimCode("ABO12C")).toBeNull();
      expect(normalizeLogClaimCode("AB!12C")).toBeNull();
      expect(normalizeLogClaimCode("")).toBeNull();
    });
  });

  describe("claim codes", () => {
    it("issues 6-char single-use codes with NX + TTL", async () => {
      const code = await issueLogClaimCode(GUILD_ID, ISSUER_ID);

      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(redis.setCalls[0]).toEqual([
        RedisKeys.logClaimCode(GUILD_ID, code),
        ISSUER_ID,
        "PX",
        expect.any(Number),
        "NX",
      ]);

      await expect(peekLogClaimCode(GUILD_ID, code)).resolves.toBe(ISSUER_ID);
      await expect(consumeLogClaimCode(GUILD_ID, code)).resolves.toBe(
        ISSUER_ID,
      );
      await expect(peekLogClaimCode(GUILD_ID, code)).resolves.toBeNull();
      await expect(consumeLogClaimCode(GUILD_ID, code)).resolves.toBeNull();
    });

    it("does not overwrite a live code", async () => {
      const code = await issueLogClaimCode(GUILD_ID, ISSUER_ID);
      redis.strings.set(RedisKeys.logClaimCode(GUILD_ID, code), "other");

      await expect(peekLogClaimCode(GUILD_ID, code)).resolves.toBe("other");
    });
  });

  describe("pending claims", () => {
    it("registers, lists oldest-first, and dismisses", async () => {
      await registerLogClaim(GUILD_ID, {
        channelId: "222222222222222222",
        authorId: ISSUER_ID,
        messageId: "999999999999999999",
        claimedAt: "2026-09-06T00:00:02.000Z",
      });
      await registerLogClaim(GUILD_ID, {
        channelId: "111111111111111111",
        authorId: ISSUER_ID,
        messageId: "888888888888888888",
        claimedAt: "2026-09-06T00:00:01.000Z",
      });

      const listed = await listLogClaims(GUILD_ID);
      expect(listed.map((c) => c.channelId)).toEqual([
        "111111111111111111",
        "222222222222222222",
      ]);

      await expect(
        dismissLogClaim(GUILD_ID, "111111111111111111"),
      ).resolves.toBe(true);
      await expect(listLogClaims(GUILD_ID)).resolves.toHaveLength(1);
      await expect(
        dismissLogClaim(GUILD_ID, "111111111111111111"),
      ).resolves.toBe(false);
    });

    it("returns an empty list when nothing is pending", async () => {
      await expect(listLogClaims(GUILD_ID)).resolves.toEqual([]);
    });

    it("skips malformed claim payloads", async () => {
      const channelId = "111111111111111111";
      redis.strings.set(
        RedisKeys.logClaim(GUILD_ID, channelId),
        "{not json",
      );
      redis.sets.set(RedisKeys.logClaimIndex(GUILD_ID), new Set([channelId]));

      await expect(listLogClaims(GUILD_ID)).resolves.toEqual([]);
    });
  });
});
