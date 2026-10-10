import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import path from "node:path";
import { promises as fs } from "node:fs";

/**
 * The registry is owner-based: `ModuleStore#unload` prunes that owner's RPC
 * handlers (dispatch answers `UnknownAction`), and loading restores them.
 * This drives an actual `ModuleStore` through its real `unload()` path and
 * confirms the afk handler is gone afterward and callable again after
 * `restoreStaticRpcOwner`.
 */

const mockedReadManifest = vi.fn();
const mockedMetaFromManifest = vi.fn();

vi.mock("@lumi/lib/module-system/manifest.js", () => ({
  readManifest: mockedReadManifest,
  metaFromManifest: mockedMetaFromManifest,
}));

import { ModuleStore } from "@lumi/lib/module-system/module-store.js";
import { getRpcHandler, registerRpcHandlers, restoreStaticRpcOwner } from "@lumi/lib/rpc/registry.js";
import { AfkRepository } from "@lumi/modules/afk/data/AfkRepository.js";
import { repositoryCache } from "@lumi/lib/cache/cache-store.js";
import { createMockPrismaClient } from "../mocks/prisma.js";
import { FakeDiscordRestPort } from "@lumi/lib/discord/fake-rest-port.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const MODULE_DIR = "/test/modules/afk";

/** `container.discordRest` fake answering `checkGuildManagerRest`'s guild lookup with a fixed owner, matching the old gateway-cache stub's `ownerId`. */
function ownerOnlyRest(guildId: string, ownerId: string): FakeDiscordRestPort {
  const fake = new FakeDiscordRestPort();
  fake.seedGuild({
    id: guildId,
    owner_id: ownerId,
    roles: [{ id: guildId, permissions: "0" }],
  } as any);
  return fake;
}

function setupAfkModule() {
  vi.spyOn(fs, "access").mockResolvedValue(undefined);
  vi.spyOn(fs, "readdir").mockImplementation(
    (p: any) =>
      Promise.resolve(path.basename(String(p)) === "afk" ? [] : ["afk"]) as any,
  );
  vi.spyOn(fs, "stat").mockImplementation(
    (p: any) =>
      Promise.resolve({
        isDirectory: () => path.basename(String(p)) === "afk",
        isFile: () => false,
      }) as any,
  );
  mockedReadManifest.mockImplementation((dir: string) => {
    if (path.basename(dir) !== "afk") return Promise.resolve(null);
    return Promise.resolve({
      name: "afk",
      displayName: "afk",
      emoji: "",
      description: "",
      version: "0.0.0",
      targetUtility: "worker" as const,
      subStores: [],
      configFields: [],
    });
  });
  mockedMetaFromManifest.mockImplementation((m: any) => ({
    name: m.name,
    displayName: m.name,
    emoji: "",
    description: "",
    version: "0.0.0",
    dependencies: [],
    conflicts: [],
  }));
}

describe("owner-based RPC registry follows ModuleStore#unload", () => {
  let store: any;
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    vi.restoreAllMocks();
    setupAfkModule();

    prisma = createMockPrismaClient();
    const guild = {
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
    (container as any).discordRest = ownerOnlyRest(GUILD_ID, OWNER_ID);
    (container as any).invalidation = {
      invalidate: vi.fn(),
      onInvalidate: vi.fn(),
      onResync: vi.fn(),
    };
    repositoryCache.clear();

    const valkey = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
      set: vi.fn(),
      pipeline: vi.fn(() => ({ setex: vi.fn(), set: vi.fn(), exec: vi.fn() })),
    };
    (container as any).valkey = valkey;

    const db = { ensureGuild: vi.fn().mockResolvedValue(undefined) } as any;
    db.afk = new AfkRepository(prisma as any, valkey as any, container.logger, db);
    db.modules = {
      getGlobalModuleStates: vi.fn().mockResolvedValue(new Map()),
      isModuleGlobalEnabled: vi.fn(),
      setModuleGlobalEnabled: vi.fn(),
    };
    (container as any).db = db;

    // Populated once, exactly like at boot - never touched again by unload().
    registerRpcHandlers();

    store = new ModuleStore(container);
    store.addRoot(new URL("file:///test/modules"));
  });

  it("drops a module's handlers on unload and restores them on load", async () => {
    await store.discover();
    const record = store.getRecord("afk");
    expect(record.dir).toBe(MODULE_DIR);

    await store.unload("afk");

    expect(store.getRecord("afk").enabled).toBe(false);
    expect(store.getRecord("afk").state).toBe("disabled");
    expect(getRpcHandler("guild.afk.list")).toBeUndefined();

    restoreStaticRpcOwner("afk");

    prisma.$seed("afkEntry", [
      { userId: "555555555555555555", guildId: GUILD_ID, reason: "lunch", since: new Date("2026-01-01") },
    ]);

    const handler = getRpcHandler("guild.afk.list");
    expect(handler).toBeDefined();

    const res = (await handler!({
      id: "req-1",
      action: "guild.afk.list",
      guildId: GUILD_ID,
      actorId: OWNER_ID,
    })) as { entries: Array<{ userId: string }> };

    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]!.userId).toBe("555555555555555555");
  });
});
