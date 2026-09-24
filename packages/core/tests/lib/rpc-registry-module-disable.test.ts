import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import path from "node:path";
import { promises as fs } from "node:fs";

/**
 * The whole point of S13's static registry (`#lib/rpc/registry.js`) is that a
 * module's RPC handlers used to be bound to its Sapphire pieces and vanished
 * the moment `ModuleStore#unload` ran. This drives an actual `ModuleStore`
 * through its real `unload()` path (not a stubbed `container.stores`, which
 * the module-not-loaded gate tests elsewhere already cover) and confirms a
 * handler for the unloaded module is still reachable and callable afterward.
 */

const mockedReadManifest = vi.fn();
const mockedMetaFromManifest = vi.fn();

vi.mock("#lib/module-system/manifest.js", () => ({
  readManifest: mockedReadManifest,
  metaFromManifest: mockedMetaFromManifest,
}));

import { ModuleStore } from "#lib/module-system/ModuleStore.js";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { AfkRepository } from "#modules/afk/data/AfkRepository.js";
import { createMockPrismaClient } from "../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const MODULE_DIR = "/test/modules/afk";

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

describe("static RPC registry survives ModuleStore#unload", () => {
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
    (container as any).invalidation = { invalidate: vi.fn() };

    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
      set: vi.fn(),
      pipeline: vi.fn(() => ({ setex: vi.fn(), set: vi.fn(), exec: vi.fn() })),
    };

    const db = { ensureGuild: vi.fn().mockResolvedValue(undefined) } as any;
    db.afk = new AfkRepository(prisma as any, redis as any, container.logger, db);
    db.modules = {
      getGlobalModuleStates: vi.fn().mockResolvedValue(new Map()),
      isModuleGlobalEnabled: vi.fn(),
      setModuleGlobalEnabled: vi.fn(),
    };
    (container as any).db = db;

    // Populated once, exactly like at boot - never touched again by unload().
    registerRpcHandlers();

    store = new ModuleStore();
    store.addRoot(new URL("file:///test/modules"));
  });

  it("still answers a call for a module unloaded through the real ModuleStore path", async () => {
    await store.discover();
    const record = store.getRecord("afk");
    expect(record.dir).toBe(MODULE_DIR);

    // Register the module's own piece instance so Store#unload() can resolve
    // it, plus a commands piece that lives under its directory, mirroring how
    // a real module owns pieces across stores.
    const fakeModulePiece: any = { name: "afk", onUnload: vi.fn().mockResolvedValue(undefined) };
    store.set("afk", fakeModulePiece);

    const ownedCommand = { name: "afk-command", location: { full: `${record.dir}/commands/afk.ts` } };
    const commandsStore = {
      name: "commands",
      paths: new Set([`${record.dir}/commands`]),
      values: vi.fn().mockReturnValue([ownedCommand]),
      unload: vi.fn().mockResolvedValue(undefined),
    };
    container.stores = {
      values: vi.fn().mockReturnValue([commandsStore]),
      get: vi.fn(() => ({ loaded: () => [], get: () => undefined })),
    } as any;

    await store.unload("afk");

    // Confirm the module was actually unloaded, not a no-op.
    expect(commandsStore.unload).toHaveBeenCalledWith("afk-command");
    expect(fakeModulePiece.onUnload).toHaveBeenCalledTimes(1);
    expect(store.getRecord("afk").enabled).toBe(false);
    expect(store.getRecord("afk").state).toBe("disabled");

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
