import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RpcActions } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";
import { AfkRepository } from "#lib/prisma/repositories/AfkRepository.js";
import { AccessRepository } from "#lib/prisma/repositories/AccessRepository.js";
import { GuildKVRepository } from "#lib/prisma/repositories/GuildKVRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";

describe("dashboard module advanced inspector RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = createMockPrismaClient();

    guild = {
      id: GUILD_ID,
      ownerId: OWNER_ID,
      members: { fetch: vi.fn() },
    };

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;

    (container as any).invalidation = { invalidate: vi.fn() };

    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
      set: vi.fn(),
      pipeline: vi.fn(() => ({ setex: vi.fn(), set: vi.fn(), exec: vi.fn() })),
    };

    const db = { ensureGuild: vi.fn().mockResolvedValue(undefined) } as any;
    db.afk = new AfkRepository(prisma as any, redis as any, container.logger, db);
    db.access = new AccessRepository(prisma as any, redis as any, container.logger, db);
    db.guildKV = new GuildKVRepository(prisma as any, redis as any, container.logger, db);
    (container as any).db = db;

    container.stores = {
      get: vi.fn(() => ({ loaded: () => [], get: () => undefined })),
    } as any;

    const mod = new DashboardModule({} as any, { name: "dashboard" });
    await mod.onLoad();
  });

  const handlerFor = (action: string) => {
    const handler = rpcHandlers.get(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: string, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const denyPermissions = () =>
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

  describe("guild.afk.list", () => {
    it("returns this guild's entries with serialized timestamps", async () => {
      prisma.$seed("afkEntry", [
        {
          userId: OWNER_ID,
          guildId: GUILD_ID,
          reason: "lunch",
          since: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          userId: INTRUDER_ID,
          guildId: OTHER_GUILD_ID,
          reason: "AFK",
          since: new Date(),
        },
      ]);

      const res = (await call(RpcActions.guildAfkList)) as any;

      expect(res.entries).toEqual([
        {
          userId: OWNER_ID,
          reason: "lunch",
          since: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(RpcActions.guildAfkList, undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.ignored", () => {
    it("lists channel rules and the guild-wide rule", async () => {
      prisma.$seed("ignoreEntry", [
        {
          id: 1,
          guildId: GUILD_ID,
          channelId: CHANNEL_ID,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: 2,
          guildId: GUILD_ID,
          channelId: null,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        { id: 3, guildId: OTHER_GUILD_ID, channelId: CHANNEL_ID, createdAt: new Date() },
      ]);

      const res = (await call(RpcActions.guildIgnoredList)) as any;

      expect(res.entries).toEqual([
        { id: 1, channelId: CHANNEL_ID, createdAt: "2026-01-01T00:00:00.000Z" },
        { id: 2, channelId: null, createdAt: "2026-01-02T00:00:00.000Z" },
      ]);
    });

    it("adds a channel rule", async () => {
      const res = (await call(RpcActions.guildIgnoredAdd, {
        channelId: CHANNEL_ID,
      })) as any;

      expect(res).toEqual({ success: true, channelId: CHANNEL_ID });
      expect(container.db.ensureGuild).toHaveBeenCalledWith(GUILD_ID);
      const rows = prisma.$all("ignoreEntry");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["channelId"]).toBe(CHANNEL_ID);
    });

    it("adds the guild-wide rule when channelId is null", async () => {
      await call(RpcActions.guildIgnoredAdd, { channelId: null });

      expect(prisma.$all("ignoreEntry")[0]!["channelId"]).toBeNull();
    });

    it("rejects a duplicate rule instead of violating the unique index", async () => {
      prisma.$seed("ignoreEntry", [
        { id: 1, guildId: GUILD_ID, channelId: CHANNEL_ID, createdAt: new Date() },
      ]);

      await expect(
        call(RpcActions.guildIgnoredAdd, { channelId: CHANNEL_ID }),
      ).rejects.toThrow("is already ignored");
      expect(prisma.$all("ignoreEntry")).toHaveLength(1);
    });

    it("removes only the targeted rule", async () => {
      prisma.$seed("ignoreEntry", [
        { id: 1, guildId: GUILD_ID, channelId: CHANNEL_ID, createdAt: new Date() },
        { id: 2, guildId: GUILD_ID, channelId: null, createdAt: new Date() },
      ]);

      await call(RpcActions.guildIgnoredRemove, { channelId: CHANNEL_ID });

      const rows = prisma.$all("ignoreEntry");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["channelId"]).toBeNull();
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(RpcActions.guildIgnoredAdd, { channelId: CHANNEL_ID }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(prisma.$all("ignoreEntry")).toHaveLength(0);
    });
  });

  describe("guild.moduleData.list", () => {
    const seedRows = () =>
      prisma.$seed("moduleData", [
        {
          guildId: GUILD_ID,
          moduleName: "afk",
          targetId: OWNER_ID,
          key: "streak",
          value: 3,
        },
        {
          guildId: GUILD_ID,
          moduleName: "mod",
          targetId: "global",
          key: "notes",
          value: { a: 1 },
        },
        {
          guildId: OTHER_GUILD_ID,
          moduleName: "afk",
          targetId: OWNER_ID,
          key: "streak",
          value: 9,
        },
      ]);

    it("returns this guild's rows with the unpaginated total", async () => {
      seedRows();

      const res = (await call(RpcActions.guildModuleDataList, {})) as any;

      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(25);
      expect(res.entries).toEqual([
        { moduleName: "afk", targetId: OWNER_ID, key: "streak", value: 3 },
        { moduleName: "mod", targetId: "global", key: "notes", value: { a: 1 } },
      ]);
    });

    it("filters by module, target and key", async () => {
      seedRows();

      const byModule = (await call(RpcActions.guildModuleDataList, {
        moduleName: "mod",
      })) as any;
      expect(byModule.total).toBe(1);
      expect(byModule.entries[0].key).toBe("notes");

      const byTarget = (await call(RpcActions.guildModuleDataList, {
        targetId: OWNER_ID,
      })) as any;
      expect(byTarget.total).toBe(1);

      const byKey = (await call(RpcActions.guildModuleDataList, {
        key: "missing",
      })) as any;
      expect(byKey.total).toBe(0);
    });

    it("rejects an oversized page", async () => {
      await expect(
        call(RpcActions.guildModuleDataList, { pageSize: 500 }),
      ).rejects.toThrow("Bad payload");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(RpcActions.guildModuleDataList, {}, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });
});
