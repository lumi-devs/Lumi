import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import * as misc from "#lib/utilities/misc.js";

class TestModuleListener extends ModuleListener {
  public handleCalls: any[][] = [];

  protected handle(...args: any[]): void {
    this.handleCalls.push(args);
  }

  public testResolveGuildId(...args: any[]): string | null {
    return this.resolveGuildId(...args);
  }
}

describe("module-system ModuleListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes module name getter", () => {
    const listener = new TestModuleListener({} as any, {
      name: "test-listener",
      module: "afk",
    });
    expect(listener.module).toBe("afk");
  });

  it("resolves guild ID from args", () => {
    const listener = new TestModuleListener({} as any, {
      name: "test-listener",
      module: "afk",
    });

    expect(listener.testResolveGuildId({ guildId: "g-1" })).toBe("g-1");
    expect(listener.testResolveGuildId({ guild: { id: "g-2" } })).toBe("g-2");
    expect(listener.testResolveGuildId({})).toBeNull();
    expect(listener.testResolveGuildId()).toBeNull();
  });

  it("runs handle only when guildId is present and module is enabled", async () => {
    const listener = new TestModuleListener({} as any, {
      name: "test-listener",
      module: "mod",
    });

    vi.spyOn(misc, "isModuleEnabled").mockResolvedValue(true);

    // No guildId resolved -> no handle
    await listener.run({} as any);
    expect(listener.handleCalls).toHaveLength(0);

    // GuildId resolved and module enabled -> runs handle
    await listener.run({ guildId: "g-100" } as any);
    expect(listener.handleCalls).toHaveLength(1);
    expect(misc.isModuleEnabled).toHaveBeenCalledWith("g-100", "mod");

    // Module disabled -> no handle
    vi.mocked(misc.isModuleEnabled).mockResolvedValue(false);
    await listener.run({ guildId: "g-100" } as any);
    expect(listener.handleCalls).toHaveLength(1); // Call count unchanged
  });
});
