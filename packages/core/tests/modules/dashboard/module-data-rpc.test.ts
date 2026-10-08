import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { GuildKVRepository } from "#lib/prisma/repositories/GuildKVRepository.js";
import { repositoryCache } from "#lib/cache/CacheStore.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";
import { FakeDiscordRestPort } from "#lib/discord/fake-rest-port.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

function everyoneRole(permissions = "0") {
  return { id: GUILD_ID, permissions };
}

describe("dashboard module data inspector RPC handler", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    repositoryCache.clear();

    prisma = createMockPrismaClient();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    const discordRest = new FakeDiscordRestPort();
    discordRest.seedGuild({ id: GUILD_ID, owner_id: OWNER_ID, roles: [everyoneRole()] } as any);
    discordRest.seedMember(GUILD_ID, { user: { id: INTRUDER_ID }, roles: [] } as any);
    (container as any).discordRest = discordRest;

    (container as any).invalidation = { invalidate: vi.fn() };

    const valkey = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
      set: vi.fn(),
      pipeline: vi.fn(() => ({ setex: vi.fn(), set: vi.fn(), exec: vi.fn() })),
    };

    (container as any).valkey = valkey;

    const db = { ensureGuild: vi.fn().mockResolvedValue(undefined) } as any;
    db.guildKV = new GuildKVRepository(prisma as any, valkey as any, container.logger, db);
    (container as any).db = db;

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
    await expect(call({}, INTRUDER_ID)).rejects.toThrow(
      "Missing ManageGuild permission",
    );
  });
});
