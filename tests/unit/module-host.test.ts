import type { LoadedModule } from "@lumi/module-runtime";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry, ModuleHost } from "../../src/core/modules.ts";

function definition(
  name: string,
  options: { commands?: string[]; listeners?: string[] } = {},
) {
  return {
    name,
    displayName: name,
    emoji: "x",
    description: "",
    version: "1.0.0",
    config: {},
    configFields: [],
    commands: (options.commands ?? []).map((command) => ({
      data: { name: command, toJSON: () => ({ name: command }) },
      execute: async () => {},
    })),
    listeners: (options.listeners ?? []).map((event) => ({
      event,
      handler: async () => {},
    })),
    tasks: [],
    onLoad: async () => [],
    onUnload: async () => {},
  } as any;
}

function loadedModule(
  name: string,
  options: { commands?: string[]; listeners?: string[] } = {},
  supermodule?: string,
): LoadedModule {
  return {
    manifest: {
      apiVersion: 2,
      name,
      displayName: name,
      emoji: "x",
      description: "",
      version: "1.0.0",
      entry: "index.ts",
      dependencies: {},
      requirements: [],
      conflicts: [],
      capabilities: [],
      configFields: [],
    },
    definition: definition(name, options),
    path: `/tmp/${name}`,
    origin: "bundled",
    supermodule,
    isSubmodule: Boolean(supermodule),
    guildsDisabled: new Set(),
  };
}

function fakeLoader(initial: LoadedModule[]) {
  const modules = new Map(
    initial.map((module) => [module.manifest.name, module]),
  );

  return {
    discover: vi.fn(async () => Array.from(modules.values())),
    loadAll: vi.fn(async (targets: LoadedModule[]) => targets),
    unload: vi.fn(async (name: string) => {
      const removed = Array.from(modules.values()).filter(
        (module) =>
          module.manifest.name === name || module.supermodule === name,
      );
      for (const module of removed) modules.delete(module.manifest.name);
      return removed;
    }),
    reload: vi.fn(async (name: string) => {
      const current = modules.get(name);
      if (current) {
        modules.set(name, {
          ...current,
          definition: definition(name, { commands: ["reloaded"] }),
        });
      }
    }),
    getModule: vi.fn((name: string) => modules.get(name)),
    isActive: vi.fn((guildId: string, name: string) => {
      const module = modules.get(name);
      if (!module || module.guildsDisabled.has(guildId)) return false;
      return module.supermodule
        ? !modules.get(module.supermodule)?.guildsDisabled.has(guildId)
        : true;
    }),
    listAll: vi.fn(() => Array.from(modules.values())),
  };
}

function setup(initial: LoadedModule[]) {
  const registry = new CommandRegistry();
  const loader = fakeLoader(initial);
  const client = {
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
  };
  const syncCommands = vi.fn(async () => {});
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const host = new ModuleHost({
    client: client as any,
    loader: loader as any,
    registry,
    services: {},
    logger,
    syncCommands,
  });

  return { host, registry, loader, client, syncCommands, logger };
}

describe("ModuleHost", () => {
  it("attaches commands and listeners when modules load", async () => {
    const demo = loadedModule("demo", {
      commands: ["ping"],
      listeners: ["messageCreate"],
    });
    const { host, registry, client, syncCommands } = setup([demo]);

    await host.load([demo]);

    expect(registry.get("ping")?.module).toBe("demo");
    expect(client.on).toHaveBeenCalledWith(
      "messageCreate",
      expect.any(Function),
    );
    expect(syncCommands).toHaveBeenCalledOnce();
  });

  it("mounts a supermodule together with its submodules", async () => {
    const parent = loadedModule("utility", { commands: ["utility"] });
    const child = loadedModule("utility-afk", { commands: ["afk"] }, "utility");
    const { host, registry, loader } = setup([parent, child]);

    await host.mount("utility");

    expect(loader.loadAll).toHaveBeenCalledWith(
      expect.arrayContaining([parent, child]),
      {},
    );
    expect(registry.get("utility")?.module).toBe("utility");
    expect(registry.get("afk")?.module).toBe("utility-afk");
  });

  it("detaches commands and listeners when a module unmounts", async () => {
    const demo = loadedModule("demo", {
      commands: ["ping"],
      listeners: ["messageCreate"],
    });
    const { host, registry, client } = setup([demo]);
    await host.load([demo]);

    await host.unmount("demo");

    expect(registry.get("ping")).toBeUndefined();
    expect(client.off).toHaveBeenCalledWith(
      "messageCreate",
      expect.any(Function),
    );
  });

  it("skips listeners for guilds where the module is disabled", async () => {
    const demo = loadedModule("demo", { listeners: ["messageCreate"] });
    const handler = vi.fn(async () => {});
    demo.definition.listeners[0].handler = handler;
    demo.guildsDisabled.add("guild");
    const { host, client, loader } = setup([demo]);
    await host.load([demo]);

    const listener = client.on.mock.calls.find(
      ([event]) => event === "messageCreate",
    )?.[1] as (message: { guildId: string }) => void;
    listener({ guildId: "guild" });

    expect(loader.isActive).toHaveBeenCalledWith("guild", "demo");
    expect(handler).not.toHaveBeenCalled();
  });

  it("re-registers commands after a reload", async () => {
    const demo = loadedModule("demo", { commands: ["ping"] });
    const { host, registry } = setup([demo]);
    await host.load([demo]);

    await host.reload("demo");

    expect(registry.get("ping")).toBeUndefined();
    expect(registry.get("reloaded")?.module).toBe("demo");
  });
});
