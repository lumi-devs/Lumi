import { describe, expect, it, vi } from "vitest";
import { ModuleManager } from "../../src/admin/services/ModuleManager.ts";

function setup() {
  const moduleLoader = { setEnabled: vi.fn(async () => {}) };
  const prisma = {
    guild: { upsert: vi.fn(async () => ({})) },
    guildModule: { upsert: vi.fn(async () => ({})) },
  };
  const syncCommands = vi.fn(async () => {});
  const manager = new ModuleManager(
    moduleLoader as any,
    prisma as any,
    syncCommands,
  );
  return { manager, moduleLoader, prisma, syncCommands };
}

describe("ModuleManager", () => {
  it("persists the disabled state, updates the loader, and resyncs that guild", async () => {
    const { manager, moduleLoader, prisma, syncCommands } = setup();

    await manager.disable("guild", "afk");

    expect(prisma.guildModule.upsert).toHaveBeenCalledWith({
      where: { guildId_module: { guildId: "guild", module: "afk" } },
      update: { enabled: false },
      create: { guildId: "guild", module: "afk", enabled: false },
    });
    expect(moduleLoader.setEnabled).toHaveBeenCalledWith(
      "afk",
      "guild",
      false,
    );
    expect(syncCommands).toHaveBeenCalledWith("guild");
  });

  it("resyncs the guild after enabling a module", async () => {
    const { manager, moduleLoader, syncCommands } = setup();

    await manager.enable("guild", "afk");

    expect(moduleLoader.setEnabled).toHaveBeenCalledWith(
      "afk",
      "guild",
      true,
    );
    expect(syncCommands).toHaveBeenCalledWith("guild");
  });
});
