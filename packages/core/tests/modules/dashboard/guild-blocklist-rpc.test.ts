import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";
import { AccessRepository } from "#lib/prisma/repositories/AccessRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const TARGET_ID = "444444444444444444";

function makeBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: TARGET_ID,
    guildId: GUILD_ID,
    reason: "spam",
    blockedBy: OWNER_ID,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("dashboard module guild blocklist RPC handlers", () => {
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
      pipeline: vi.fn(() => ({ setex: vi.fn(), set: vi.fn(), exec: vi.fn() })),
    };

    const db = { ensureGuild: vi.fn().mockResolvedValue(undefined) } as any;
    db.access = new AccessRepository(prisma as any, redis as any, container.logger, db);
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

  it("lists only this guild's rows, never the global ones", async () => {
    prisma.$seed("blocklist", [
      makeBlock({ id: 1, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      makeBlock({ id: 2, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      makeBlock({ id: 3, guildId: null }),
      makeBlock({ id: 4, guildId: OTHER_GUILD_ID }),
    ]);

    const res = (await call(RPC_ACTIONS.guildBlocklistList, {})) as any;

    expect(res.total).toBe(2);
    expect(res.entries.map((e: any) => e.id)).toEqual([2, 1]);
    expect(res.entries[0].createdAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("paginates and reports the unpaginated total", async () => {
    prisma.$seed(
      "blocklist",
      Array.from({ length: 5 }, (_, i) =>
        makeBlock({ id: i + 1, createdAt: new Date(2026, 0, i + 1) }),
      ),
    );

    const res = (await call(RPC_ACTIONS.guildBlocklistList, {
      page: 2,
      pageSize: 2,
    })) as any;

    expect(res.total).toBe(5);
    expect(res.entries.map((e: any) => e.id)).toEqual([3, 2]);
  });

  it("adds a guild-scoped entry attributed to the acting manager", async () => {
    const res = (await call(RPC_ACTIONS.guildBlocklistAdd, {
      userId: TARGET_ID,
      reason: "raiding",
    })) as any;

    expect(res).toEqual({ success: true, userId: TARGET_ID });
    const rows = prisma.$all("blocklist");
    expect(rows).toHaveLength(1);
    expect(rows[0]!["guildId"]).toBe(GUILD_ID);
    expect(rows[0]!["blockedBy"]).toBe(OWNER_ID);
  });

  it("rejects a duplicate entry in the same guild", async () => {
    prisma.$seed("blocklist", [makeBlock({ id: 1 })]);

    await expect(
      call(RPC_ACTIONS.guildBlocklistAdd, { userId: TARGET_ID }),
    ).rejects.toThrow("already blocklisted in this server");
  });

  it("does not treat a global row as a guild one", async () => {
    prisma.$seed("blocklist", [makeBlock({ id: 1, guildId: null })]);

    await call(RPC_ACTIONS.guildBlocklistAdd, { userId: TARGET_ID });

    expect(prisma.$all("blocklist")).toHaveLength(2);
  });

  it("removes only this guild's row", async () => {
    prisma.$seed("blocklist", [
      makeBlock({ id: 1 }),
      makeBlock({ id: 2, guildId: null }),
    ]);

    await call(RPC_ACTIONS.guildBlocklistRemove, { userId: TARGET_ID });

    const rows = prisma.$all("blocklist");
    expect(rows).toHaveLength(1);
    expect(rows[0]!["guildId"]).toBeNull();
  });

  it("rejects an actor without ManageGuild", async () => {
    denyPermissions();

    await expect(
      call(RPC_ACTIONS.guildBlocklistList, {}, INTRUDER_ID),
    ).rejects.toThrow("Missing ManageGuild permission");
    await expect(
      call(RPC_ACTIONS.guildBlocklistAdd, { userId: TARGET_ID }, INTRUDER_ID),
    ).rejects.toThrow("Missing ManageGuild permission");
    await expect(
      call(RPC_ACTIONS.guildBlocklistRemove, { userId: TARGET_ID }, INTRUDER_ID),
    ).rejects.toThrow("Missing ManageGuild permission");
    expect(prisma.$all("blocklist")).toHaveLength(0);
  });
});
