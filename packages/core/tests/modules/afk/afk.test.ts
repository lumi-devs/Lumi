import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAfkEntry,
  setAfkEntry,
  clearAfkEntry,
  clearAllAfkForUser,
  iterateAllAfkEntries,
  getAfkEntriesForGuild,
  getAfkStats,
  getAfkMentions,
  addAfkMention,
  clearAfkMentions,
  isAfkOnCooldown,
  setAfkCooldown,
  addAfkMentionsBatch,
} from "#modules/afk/data/afk.js";
import { AfkKeys, AfkTTL } from "#modules/afk/keys.js";
import { container } from "@sapphire/framework";

vi.mock("@sapphire/framework", () => ({
  container: {
    redis: {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      scan: vi.fn(),
      pipeline: vi.fn().mockReturnThis(),
      multi: vi.fn().mockReturnThis(),
      lpush: vi.fn().mockReturnThis(),
      ltrim: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(),
      lrange: vi.fn(),
      exists: vi.fn(),
      set: vi.fn(),
    },
    db: {
      afk: {
        findEntry: vi.fn(),
        upsertEntry: vi.fn(),
        deleteEntry: vi.fn(),
        deleteAllForUser: vi.fn(),
        iterateAll: vi.fn(),
        findForGuild: vi.fn(),
        countAll: vi.fn(),
      },
    },
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
    },
    invalidation: undefined as any,
  },
}));

vi.mock("#modules/afk/index.js", () => ({
  sanitizeReason: vi.fn((s) => s),
}));

describe("AFK Module Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (container as any).invalidation = undefined;
  });

  describe("AfkKeys and AfkTTL", () => {
    it("should generate correct key strings and TTL values", () => {
      expect(AfkKeys.afk("g1", "u1")).toBe("lumi:afk:g1:u1");
      expect(AfkKeys.mentionCooldown("c1")).toBe("lumi:afk:cd:mention:c1");
      expect(AfkKeys.welcomeCooldown("c1", "u1")).toBe("lumi:afk:cd:welcome:c1:u1");
      expect(AfkKeys.removalCooldown("g1", "u1")).toBe("lumi:afk:cd:removal:g1:u1");
      expect(AfkKeys.removalCooldownPattern()).toBe("lumi:afk:cd:removal:*");
      expect(AfkKeys.nickEditCooldown("u1")).toBe("lumi:afk:cd:nick:u1");
      expect(AfkKeys.allForUserPattern("u1")).toBe("lumi:afk:*:u1");
      expect(AfkKeys.mentions("g1", "u1")).toBe("lumi:afk:mentions:g1:u1");

      expect(AfkTTL.entry).toBe(86400);
      expect(AfkTTL.mentions).toBe(86400);
    });
  });

  describe("getAfkEntry", () => {
    it("returns cached entry if present in Redis", async () => {
      const nowStr = new Date().toISOString();
      (container.redis.get as any).mockResolvedValue(
        JSON.stringify({ since: nowStr, reason: "lunch" })
      );
      const result = await getAfkEntry("guild-1", "user-1");
      expect(result).toBeDefined();
      expect(result!.reason).toBe("lunch");
      expect(result!.since).toBeInstanceOf(Date);
      expect(container.db.afk.findEntry).not.toHaveBeenCalled();
    });

    it("fetches from DB and sets Redis cache on Redis cache miss", async () => {
      (container.redis.get as any).mockResolvedValue(null);
      const mockDbEntry = { guildId: "g1", userId: "u1", reason: "sleeping", since: new Date() };
      (container.db.afk.findEntry as any).mockResolvedValue(mockDbEntry);

      const result = await getAfkEntry("g1", "u1");
      expect(result).toEqual(mockDbEntry);
      expect(container.redis.setex).toHaveBeenCalledWith(
        "lumi:afk:g1:u1",
        86400,
        JSON.stringify(mockDbEntry)
      );
    });

    it("returns null if Redis cache contains string 'null'", async () => {
      (container.redis.get as any).mockResolvedValue("null");
      const result = await getAfkEntry("g1", "u1");
      expect(result).toBeNull();
    });
  });

  describe("setAfkEntry", () => {
    it("upserts entry in DB and caches in Redis", async () => {
      const mockEntry = { guildId: "g1", userId: "u1", reason: "brb", since: new Date() };
      (container.db.afk.upsertEntry as any).mockResolvedValue(mockEntry);

      const result = await setAfkEntry("g1", "u1", "brb");
      expect(result).toBe(mockEntry);
      expect(container.redis.setex).toHaveBeenCalledWith(
        "lumi:afk:g1:u1",
        86400,
        JSON.stringify(mockEntry)
      );
    });
  });

  describe("clearAfkEntry", () => {
    it("deletes from DB and redis when invalidation is absent", async () => {
      (container.db.afk.deleteEntry as any).mockResolvedValue(undefined);
      const res = await clearAfkEntry("g1", "u1");
      expect(res).toBe(true);
      expect(container.db.afk.deleteEntry).toHaveBeenCalledWith("g1", "u1");
      expect(container.redis.del).toHaveBeenCalledWith("lumi:afk:g1:u1");
    });

    it("uses invalidation service when available", async () => {
      (container as any).invalidation = { invalidate: vi.fn().mockResolvedValue(undefined) };
      (container.db.afk.deleteEntry as any).mockResolvedValue(undefined);

      const res = await clearAfkEntry("g1", "u1");
      expect(res).toBe(true);
      expect(container.invalidation.invalidate).toHaveBeenCalledWith("lumi:afk:g1:u1");
      expect(container.redis.del).not.toHaveBeenCalled();
    });

    it("logs error and returns false on failure", async () => {
      (container.db.afk.deleteEntry as any).mockRejectedValue(new Error("DB error"));

      const res = await clearAfkEntry("g1", "u1");
      expect(res).toBe(false);
      expect(container.logger.error).toHaveBeenCalled();
    });
  });

  describe("clearAllAfkForUser", () => {
    it("handles cursor scanning and redis del for user keys", async () => {
      (container.db.afk.deleteAllForUser as any).mockResolvedValue(2);
      (container.redis.scan as any)
        .mockResolvedValueOnce(["42", ["key1"]])
        .mockResolvedValueOnce(["0", ["key2"]]);

      const count = await clearAllAfkForUser("u1");
      expect(count).toBe(2);
      expect(container.redis.del).toHaveBeenCalledWith("key1", "key2");
    });

    it("uses invalidation service for user keys when available", async () => {
      (container as any).invalidation = { invalidate: vi.fn().mockResolvedValue(undefined) };
      (container.db.afk.deleteAllForUser as any).mockResolvedValue(1);
      (container.redis.scan as any).mockResolvedValueOnce(["0", ["key1"]]);

      await clearAllAfkForUser("u1");
      expect(container.invalidation.invalidate).toHaveBeenCalledWith("key1");
      expect(container.redis.del).not.toHaveBeenCalled();
    });

    it("does nothing with redis/invalidation if no keys matched", async () => {
      (container.db.afk.deleteAllForUser as any).mockResolvedValue(0);
      (container.redis.scan as any).mockResolvedValueOnce(["0", []]);

      const count = await clearAllAfkForUser("u1");
      expect(count).toBe(0);
      expect(container.redis.del).not.toHaveBeenCalled();
    });
  });

  describe("AFK bulk & stats queries", () => {
    it("iterateAllAfkEntries delegates to db.afk.iterateAll", async () => {
      const pages = [[{ id: "1" }], [{ id: "2" }]];
      (container.db.afk.iterateAll as any).mockImplementation(
        async function* () {
          yield* pages;
        },
      );

      const seen = [];
      for await (const page of iterateAllAfkEntries()) seen.push(page);

      expect(seen).toEqual(pages);
    });

    it("getAfkEntriesForGuild delegates to db.afk.findForGuild", async () => {
      const mockGuild = [{ id: "1" }];
      (container.db.afk.findForGuild as any).mockResolvedValue(mockGuild);
      const res = await getAfkEntriesForGuild("G1");
      expect(res).toBe(mockGuild);
      expect(container.db.afk.findForGuild).toHaveBeenCalledWith("G1");
    });

    it("getAfkStats counts active entries and removal cooldown keys", async () => {
      (container.db.afk.countAll as any).mockResolvedValue(5);
      (container.redis.scan as any).mockResolvedValueOnce(["0", ["cd1", "cd2"]]);

      const stats = await getAfkStats();
      expect(stats).toEqual({ activeEntries: 5, activeCooldowns: 2 });
    });
  });

  describe("AFK Mentions", () => {
    it("adds and retrieves AFK mentions", async () => {
      const mockMention = { authorId: "u2", authorName: "Bob", channelId: "c1", messageId: "m1", ts: 100 };
      await addAfkMention("g1", "u1", mockMention);
      expect(container.redis.multi).toHaveBeenCalled();

      (container.redis.lrange as any).mockResolvedValue([
        JSON.stringify(mockMention),
        "null",
      ]);
      const mentions = await getAfkMentions("g1", "u1");
      expect(mentions.length).toBe(1);
      expect(mentions[0]!.authorId).toBe("u2");
    });

    it("batch adds mentions for multiple users", async () => {
      const mentions = [
        { userId: "u1", mention: { authorId: "a1", authorName: "Alice", channelId: "c1", messageId: "m1", ts: 1 } },
        { userId: "u2", mention: { authorId: "a2", authorName: "Bob", channelId: "c1", messageId: "m2", ts: 2 } },
      ];

      await addAfkMentionsBatch("g1", mentions);
      // Batched writes go through a pipeline rather than MULTI: each user's
      // mentions key hashes to its own slot, and a cross-slot transaction is
      // not expressible in Redis Cluster.
      expect(container.redis.pipeline).toHaveBeenCalled();
      expect(container.redis.lpush).toHaveBeenCalledTimes(mentions.length);
    });

    it("addAfkMentionsBatch returns early for empty mentions array", async () => {
      await addAfkMentionsBatch("g1", []);
      expect(container.redis.multi).not.toHaveBeenCalled();
    });

    it("clearAfkMentions deletes mentions key or invalidates it", async () => {
      await clearAfkMentions("g1", "u1");
      expect(container.redis.del).toHaveBeenCalledWith("lumi:afk:mentions:g1:u1");

      (container as any).invalidation = { invalidate: vi.fn().mockResolvedValue(undefined) };
      await clearAfkMentions("g1", "u1");
      expect(container.invalidation.invalidate).toHaveBeenCalledWith("lumi:afk:mentions:g1:u1");
    });
  });

  describe("AFK Cooldowns", () => {
    it("checks and sets cooldowns", async () => {
      (container.redis.exists as any).mockResolvedValue(1);
      const res = await isAfkOnCooldown("cd-key");
      expect(res).toBe(true);

      await setAfkCooldown("cd-key", 5000);
      expect(container.redis.set).toHaveBeenCalledWith("cd-key", "1", "PX", 5000);
    });
  });
});
