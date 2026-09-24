import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { GuildKVRepository } from "#lib/prisma/repositories/GuildKVRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

describe("dashboard module data inspector RPC handler", () => {
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
    db.guildKV = new GuildKVRepository(prisma as any, redis as any, container.logger, db);
    (container as any).db = db;

    container.stores = {
      get: vi.fn(() => ({ loaded: () => [], get: () => undefined })),
    } as any;

    registerRpcHandlers();
  });

  const call = (data?: unknown, actorId = OWNER_ID) => {
    const handler = getRpcHandler("guild.moduleData.list");
    if (!handler) throw new Error("guild.moduleData.list handler not registered");
    return handler({
      id: "req",
      action: "guild.moduleData.list",
      guildId: GUILD_ID,
      actorId,
      data,
    });
  };

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

    const res = (await call({})) as any;

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

    const byModule = (await call({ moduleName: "mod" })) as any;
    expect(byModule.total).toBe(1);
    expect(byModule.entries[0].key).toBe("notes");

    const byTarget = (await call({ targetId: OWNER_ID })) as any;
    expect(byTarget.total).toBe(1);

    const byKey = (await call({ key: "missing" })) as any;
    expect(byKey.total).toBe(0);
  });

  it("rejects an oversized page", async () => {
    await expect(call({ pageSize: 500 })).rejects.toThrow("Bad payload");
  });

  it("rejects an actor without ManageGuild", async () => {
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

    await expect(call({}, INTRUDER_ID)).rejects.toThrow(
      "Missing ManageGuild permission",
    );
  });
});
