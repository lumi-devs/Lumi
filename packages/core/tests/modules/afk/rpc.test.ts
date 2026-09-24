import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { AfkRepository } from "#modules/afk/data/AfkRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

describe("afk module RPC handlers", () => {
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
    db.afk = new AfkRepository(prisma as any, redis as any, container.logger, db);
    (container as any).db = db;

    container.stores = {
      get: vi.fn(() => ({ loaded: () => [], get: () => undefined })),
    } as any;

    registerRpcHandlers();
  });

  const call = (actorId = OWNER_ID) => {
    const handler = getRpcHandler("guild.afk.list");
    if (!handler) throw new Error("guild.afk.list handler not registered");
    return handler({ id: "req", action: "guild.afk.list", guildId: GUILD_ID, actorId });
  };

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

    const res = (await call()) as any;

    expect(res.entries).toEqual([
      {
        userId: OWNER_ID,
        reason: "lunch",
        since: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("rejects an actor without ManageGuild", async () => {
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

    await expect(call(INTRUDER_ID)).rejects.toThrow("Missing ManageGuild permission");
  });
});
