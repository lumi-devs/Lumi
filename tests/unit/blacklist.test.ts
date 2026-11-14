import { describe, expect, it } from "vitest";
import {
  clearGuildBlacklisted,
  clearUserBlacklisted,
  isGuildBlacklisted,
  isUserBlacklisted,
  setGuildBlacklisted,
  setUserBlacklisted,
} from "../../src/core/blacklist.ts";

function setup() {
  const guilds = new Map<string, { guildId: string; reason?: string | null }>();
  const users = new Map<string, { userId: string; reason?: string | null }>();
  const values = new Map<string, unknown>();
  const cache = {
    async getOrLoad<T>(
      key: string,
      _ttlMs: number,
      loader: () => Promise<T | null | undefined>,
    ): Promise<T | null> {
      if (values.has(key)) return values.get(key) as T;
      const loaded = await loader();
      if (loaded !== null && loaded !== undefined) values.set(key, loaded);
      return loaded ?? null;
    },
    async del(key: string) {
      values.delete(key);
    },
  };
  const prisma = {
    guildBlacklist: {
      findUnique: async ({ where }: { where: { guildId: string } }) =>
        guilds.get(where.guildId) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: { guildId: string };
        create: { guildId: string; reason?: string | null };
      }) => {
        guilds.set(where.guildId, create);
        return create;
      },
      deleteMany: async ({ where }: { where: { guildId: string } }) => {
        guilds.delete(where.guildId);
        return { count: 1 };
      },
    },
    userBlacklist: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        users.get(where.userId) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: { userId: string };
        create: { userId: string; reason?: string | null };
      }) => {
        users.set(where.userId, create);
        return create;
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        users.delete(where.userId);
        return { count: 1 };
      },
    },
  };
  return { prisma: prisma as never, cache: cache as never };
}

describe("blacklist cache invalidation", () => {
  it("makes guild blacklist additions and removals visible immediately", async () => {
    const { prisma, cache } = setup();

    await expect(isGuildBlacklisted(prisma, cache, "guild")).resolves.toBe(
      false,
    );
    await setGuildBlacklisted(prisma, cache, "guild", "rule breaker");
    await expect(isGuildBlacklisted(prisma, cache, "guild")).resolves.toBe(
      true,
    );

    await clearGuildBlacklisted(prisma, cache, "guild");
    await expect(isGuildBlacklisted(prisma, cache, "guild")).resolves.toBe(
      false,
    );
  });

  it("makes user blacklist additions and removals visible immediately", async () => {
    const { prisma, cache } = setup();

    await expect(isUserBlacklisted(prisma, cache, "user")).resolves.toBe(false);
    await setUserBlacklisted(prisma, cache, "user", "abuse");
    await expect(isUserBlacklisted(prisma, cache, "user")).resolves.toBe(true);

    await clearUserBlacklisted(prisma, cache, "user");
    await expect(isUserBlacklisted(prisma, cache, "user")).resolves.toBe(false);
  });
});
