import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { AccessRepository } from "#lib/prisma/repositories/AccessRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";

describe("core module ignored-channel RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;

  beforeEach(() => {
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
    db.access = new AccessRepository(prisma as any, redis as any, container.logger, db);
    (container as any).db = db;

    container.stores = {
      get: vi.fn(() => ({ loaded: () => [], get: () => undefined })),
    } as any;

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: RpcActionName, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const denyPermissions = () =>
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

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

    const res = (await call("guild.ignored.list")) as any;

    expect(res.entries).toEqual([
      { id: 1, channelId: CHANNEL_ID, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: 2, channelId: null, createdAt: "2026-01-02T00:00:00.000Z" },
    ]);
  });

  it("adds a channel rule", async () => {
    const res = (await call("guild.ignored.add", {
      channelId: CHANNEL_ID,
    })) as any;

    expect(res).toEqual({ success: true, channelId: CHANNEL_ID });
    expect(container.db.ensureGuild).toHaveBeenCalledWith(GUILD_ID);
    const rows = prisma.$all("ignoreEntry");
    expect(rows).toHaveLength(1);
    expect(rows[0]!["channelId"]).toBe(CHANNEL_ID);
  });

  it("adds the guild-wide rule when channelId is null", async () => {
    await call("guild.ignored.add", { channelId: null });

    expect(prisma.$all("ignoreEntry")[0]!["channelId"]).toBeNull();
  });

  it("rejects a duplicate rule instead of violating the unique index", async () => {
    prisma.$seed("ignoreEntry", [
      { id: 1, guildId: GUILD_ID, channelId: CHANNEL_ID, createdAt: new Date() },
    ]);

    await expect(
      call("guild.ignored.add", { channelId: CHANNEL_ID }),
    ).rejects.toThrow("is already ignored");
    expect(prisma.$all("ignoreEntry")).toHaveLength(1);
  });

  it("removes only the targeted rule", async () => {
    prisma.$seed("ignoreEntry", [
      { id: 1, guildId: GUILD_ID, channelId: CHANNEL_ID, createdAt: new Date() },
      { id: 2, guildId: GUILD_ID, channelId: null, createdAt: new Date() },
    ]);

    await call("guild.ignored.remove", { channelId: CHANNEL_ID });

    const rows = prisma.$all("ignoreEntry");
    expect(rows).toHaveLength(1);
    expect(rows[0]!["channelId"]).toBeNull();
  });

  it("rejects an actor without ManageGuild", async () => {
    denyPermissions();

    await expect(
      call("guild.ignored.add", { channelId: CHANNEL_ID }, INTRUDER_ID),
    ).rejects.toThrow("Missing ManageGuild permission");
    expect(prisma.$all("ignoreEntry")).toHaveLength(0);
  });
});
