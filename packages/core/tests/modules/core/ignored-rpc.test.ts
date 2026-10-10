import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "@lumi/lib/rpc/registry.js";
import { AccessRepository } from "@lumi/lib/prisma/repositories/access-repository.js";
import { repositoryCache } from "@lumi/lib/cache/cache-store.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";
import { FakeDiscordRestPort } from "@lumi/lib/discord/fake-rest-port.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";

/** Wires `container.discordRest` to answer `checkGuildManagerRest`'s guild/member lookups; denies any non-owner actor by default (empty roles + a permission-less `@everyone`). */
function mockGuildManagerRest(): void {
  const fake = new FakeDiscordRestPort();
  fake.seedGuild({
    id: GUILD_ID,
    owner_id: OWNER_ID,
    roles: [{ id: GUILD_ID, permissions: "0" }],
  } as any);
  fake.seedMember(GUILD_ID, { user: { id: OWNER_ID }, roles: [] } as any);
  fake.seedMember(GUILD_ID, { user: { id: INTRUDER_ID }, roles: [] } as any);
  (container as any).discordRest = fake;
}

describe("core module ignored-channel RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = createMockPrismaClient();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    mockGuildManagerRest();
    repositoryCache.clear();

    (container as any).invalidation = { invalidate: vi.fn() };

    const valkey = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
      set: vi.fn(),
      pipeline: vi.fn(() => ({ setex: vi.fn(), set: vi.fn(), exec: vi.fn() })),
    };
    (container as any).valkey = valkey;

    const db = { ensureGuild: vi.fn().mockResolvedValue(undefined) } as any;
    db.access = new AccessRepository(prisma as any, valkey as any, container.logger, db);
    db.config = {
      getGuildSettings: vi.fn(async (id: string) =>
        prisma.$all("guild").find((g) => g["id"] === id) ?? { ignored: false },
      ),
    };
    (container as any).db = db;

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: RpcActionName, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const denyPermissions = () => mockGuildManagerRest();

  it("lists only this guild's channel rules", async () => {
    prisma.$seed("ignoreEntry", [
      {
        id: 1,
        guildId: GUILD_ID,
        channelId: CHANNEL_ID,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      { id: 3, guildId: OTHER_GUILD_ID, channelId: CHANNEL_ID, createdAt: new Date() },
    ]);

    const res = (await call("guild.ignored.list")) as any;

    expect(res.entries).toEqual([
      { id: 1, channelId: CHANNEL_ID, createdAt: "2026-01-01T00:00:00.000Z" },
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

  it("sets the guild-wide flag when channelId is null", async () => {
    await call("guild.ignored.add", { channelId: null });

    const rows = prisma.$all("guild");
    expect(rows).toHaveLength(1);
    expect(rows[0]!["ignored"]).toBe(true);
  });

  it("rejects a duplicate channel rule instead of violating the unique index", async () => {
    prisma.$seed("ignoreEntry", [
      { id: 1, guildId: GUILD_ID, channelId: CHANNEL_ID, createdAt: new Date() },
    ]);

    await expect(
      call("guild.ignored.add", { channelId: CHANNEL_ID }),
    ).rejects.toThrow("is already ignored");
    expect(prisma.$all("ignoreEntry")).toHaveLength(1);
  });

  it("rejects re-setting the guild-wide flag while it is already set", async () => {
    prisma.$seed("guild", [{ id: GUILD_ID, ignored: true }]);

    await expect(
      call("guild.ignored.add", { channelId: null }),
    ).rejects.toThrow("already ignored");
  });

  it("removes only the targeted channel rule", async () => {
    prisma.$seed("ignoreEntry", [
      { id: 1, guildId: GUILD_ID, channelId: CHANNEL_ID, createdAt: new Date() },
    ]);
    prisma.$seed("guild", [{ id: GUILD_ID, ignored: true }]);

    await call("guild.ignored.remove", { channelId: CHANNEL_ID });

    expect(prisma.$all("ignoreEntry")).toHaveLength(0);
    expect(prisma.$all("guild")[0]!["ignored"]).toBe(true);
  });

  it("clears the guild-wide flag when channelId is null", async () => {
    prisma.$seed("guild", [{ id: GUILD_ID, ignored: true }]);

    await call("guild.ignored.remove", { channelId: null });

    expect(prisma.$all("guild")[0]!["ignored"]).toBe(false);
  });

  it("rejects an actor without ManageGuild", async () => {
    denyPermissions();

    await expect(
      call("guild.ignored.add", { channelId: CHANNEL_ID }, INTRUDER_ID),
    ).rejects.toThrow("Missing ManageGuild permission");
    expect(prisma.$all("ignoreEntry")).toHaveLength(0);
  });
});
