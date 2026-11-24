import { describe, expect, it, vi } from "vitest";
import { createGuildSync } from "../../src/core/guildSync.ts";

describe("createGuildSync", () => {
  it("seeds guild records and built-in permits", async () => {
    const upsert = vi.fn(async () => {});
    const seedBuiltinPermits = vi.fn(async () => {});
    const sync = createGuildSync({
      prisma: { guild: { upsert } } as never,
      permits: { seedBuiltinPermits } as never,
      moduleLoader: { listAll: () => [] } as never,
      logger: { warn: vi.fn() } as never,
    });

    await sync.syncRecord({
      id: "guild",
      name: "Guild",
      iconURL: () => "icon",
      ownerId: "owner",
    } as never);

    expect(upsert).toHaveBeenCalledWith({
      where: { id: "guild" },
      update: {
        name: "Guild",
        icon: "icon",
        ownerId: "owner",
        leftAt: null,
      },
      create: { id: "guild", name: "Guild", icon: "icon", ownerId: "owner" },
    });
    expect(seedBuiltinPermits).toHaveBeenCalledWith("guild");
  });

  it("applies stored module state and defaults missing modules to enabled", async () => {
    const setEnabled = vi.fn(async () => {});
    const sync = createGuildSync({
      prisma: {
        guildModule: {
          findMany: async () => [{ module: "disabled", enabled: false }],
        },
        guild: { findUnique: async () => ({ settings: {} }) },
      } as never,
      permits: {} as never,
      moduleLoader: {
        listAll: () => [
          { manifest: { name: "disabled" } },
          { manifest: { name: "missing" } },
        ],
        setEnabled,
      } as never,
      logger: { warn: vi.fn() } as never,
    });

    await sync.syncModules("guild");

    expect(setEnabled).toHaveBeenCalledWith("disabled", "guild", false);
    expect(setEnabled).toHaveBeenCalledWith("missing", "guild", true);
  });

  it("determines module enabled state from GuildModule rows", async () => {
    const setEnabled = vi.fn(async () => {});
    const sync = createGuildSync({
      prisma: {
        guildModule: {
          findMany: async () => [
            { module: "disabledFeature", enabled: false },
            { module: "enabledFeature", enabled: true },
          ],
        },
      } as never,
      permits: {} as never,
      moduleLoader: {
        listAll: () => [
          { manifest: { name: "disabledFeature" } },
          { manifest: { name: "enabledFeature" } },
          { manifest: { name: "defaultFeature" } },
        ],
        setEnabled,
      } as never,
      logger: { warn: vi.fn() } as never,
    });

    await sync.syncModules("guild");

    expect(setEnabled).toHaveBeenCalledWith("disabledFeature", "guild", false);
    expect(setEnabled).toHaveBeenCalledWith("enabledFeature", "guild", true);
    expect(setEnabled).toHaveBeenCalledWith("defaultFeature", "guild", true);
  });
});
