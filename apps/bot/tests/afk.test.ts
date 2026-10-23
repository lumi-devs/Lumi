import { afterAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";
import type { LumiServices } from "@lumi/module-kit";
import { ModuleLoader } from "@lumi/module-runtime";

const modulesRoot = fileURLToPath(new URL("../../../modules/", import.meta.url));
const attached = new Map<string, Set<(...args: unknown[]) => void>>();

const client = {
  on(event: string, listener: (...args: unknown[]) => void) {
    const set = attached.get(event) ?? new Set();
    set.add(listener);
    attached.set(event, set);
    return client;
  },
  off(event: string, listener: (...args: unknown[]) => void) {
    attached.get(event)?.delete(listener);
    return client;
  },
} as unknown as Client;

const services = {
  client,
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  db: {
    modules: {
      isGlobalEnabled: async () => true,
      isEnabled: async () => true,
    },
  },
} as unknown as LumiServices;

const loader = new ModuleLoader({
  roots: [{ path: modulesRoot, origin: "bundled" }],
  getServices: () => services,
  botVersion: "0.1.0",
});

afterAll(async () => {
  await loader.unloadAll();
});

describe("bundled modules", () => {
  test("loads afk with its commands and listener", async () => {
    await loader.load();
    const afk = loader.get("afk");
    expect(afk?.definition.name).toBe("afk");
    expect([...afk!.commands.keys()].sort()).toEqual(["afk", "afkclean", "afklist"]);
    expect(attached.get("messageCreate")?.size).toBe(1);
  });

  test("unload removes the listener and commands", async () => {
    await loader.unload("afk");
    expect(loader.get("afk")).toBeUndefined();
    expect(attached.get("messageCreate")?.size).toBe(0);
  });

  test("reload brings the module back", async () => {
    await loader.reload("afk");
    expect(loader.command("afk")?.name).toBe("afk");
    expect(attached.get("messageCreate")?.size).toBe(1);
  });
});
