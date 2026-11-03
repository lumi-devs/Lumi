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

  it("keeps modules with disabled feature flags inactive", async () => {
    const setEnabled = vi.fn(async () => {});
    const sync = createGuildSync({
      prisma: {
        guildModule: {
          findMany: async () => [{ module: "feature", enabled: true }],
        },
        guild: {
          findUnique: async () => ({
            settings: {
              feature: { enabled: false },
              enabledFeature: { enabled: true },
            },
          }),
        },
      } as never,
      permits: {} as never,
      moduleLoader: {
        listAll: () => [
          {
            manifest: {
              name: "feature",
              configFields: [
                { key: "enabled", type: "boolean", default: false },
              ],
            },
          },
          {
            manifest: {
              name: "enabledFeature",
              configKey: "enabledFeature",
              configFields: [
                { key: "enabled", type: "boolean", default: false },
              ],
            },
          },
          {
            manifest: {
              name: "defaultFeature",
              configFields: [
                { key: "enabled", type: "boolean", default: false },
              ],
            },
          },
          { manifest: { name: "noFlag" } },
        ],
        setEnabled,
      } as never,
      logger: { warn: vi.fn() } as never,
    });

    await sync.syncModules("guild");

    expect(setEnabled).toHaveBeenCalledWith("feature", "guild", false);
    expect(setEnabled).toHaveBeenCalledWith("enabledFeature", "guild", true);
    expect(setEnabled).toHaveBeenCalledWith("defaultFeature", "guild", false);
    expect(setEnabled).toHaveBeenCalledWith("noFlag", "guild", true);
  });
});
