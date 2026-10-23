import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LumiServices } from "@lumi/module-kit";
import { ModuleLoader } from "../src/index.ts";

const roots: string[] = [];

async function fixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lumi-loader-"));
  roots.push(dir);
  return dir;
}

async function writeModule(
  root: string,
  name: string,
  options: { dependencies?: Record<string, string>; source?: string } = {},
): Promise<void> {
  await mkdir(path.join(root, name), { recursive: true });
  await writeFile(
    path.join(root, name, "manifest.json"),
    JSON.stringify({
      apiVersion: 2,
      name,
      displayName: name,
      emoji: "🧪",
      description: `${name} module`,
      version: "1.0.0",
      entry: "./index.js",
      dependencies: options.dependencies ?? {},
    }),
  );
  await writeFile(
    path.join(root, name, "index.js"),
    options.source ??
      `export default { name: ${JSON.stringify(name)}, displayName: ${JSON.stringify(name)}, description: ${JSON.stringify(`${name} module`)} };`,
  );
}

function makeLoader(root: string): ModuleLoader {
  const services = {
    client: { on() {}, off() {} },
    logger: { info() {}, warn() {}, error() {} },
    db: {
      modules: {
        isGlobalEnabled: async () => true,
        isEnabled: async () => true,
      },
    },
  } as unknown as LumiServices;

  return new ModuleLoader({
    roots: [{ path: root, origin: "bundled" }],
    getServices: () => services,
    botVersion: "0.1.0",
  });
}

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("module loader", () => {
  test("marks a dependency cycle broken and keeps loading other modules", async () => {
    const root = await fixture();
    await writeModule(root, "a", { dependencies: { b: "^1.0.0" } });
    await writeModule(root, "b", { dependencies: { a: "^1.0.0" } });
    await writeModule(root, "c");

    const loader = makeLoader(root);
    await loader.load();

    expect(loader.get("c")?.definition.name).toBe("c");
    expect(loader.get("a")).toBeUndefined();
    expect(loader.get("b")).toBeUndefined();
    expect(loader.status().find((status) => status.name === "a")?.error).toContain("cycle");
  });

  test("fails a module whose command is not scoped to it", async () => {
    const root = await fixture();
    await writeModule(root, "rogue", {
      source: `export default {
        name: "rogue",
        displayName: "Rogue",
        description: "rogue module",
        commands: [{ name: "rogue", description: "rogue", module: null, run() {} }]
      };`,
    });

    const loader = makeLoader(root);
    await loader.load();

    expect(loader.command("rogue")).toBeUndefined();
    expect(loader.status()[0]?.error).toContain("must declare module");
  });

  test("rejects a module command that collides with a built-in", async () => {
    const root = await fixture();
    await writeModule(root, "collide", {
      source: `export default {
        name: "collide",
        displayName: "Collide",
        description: "collide module",
        commands: [{ name: "ping", description: "ping", module: "collide", run() {} }]
      };`,
    });

    const services = {
      client: { on() {}, off() {} },
      logger: { info() {}, warn() {}, error() {} },
      db: { modules: { isGlobalEnabled: async () => true } },
    } as unknown as LumiServices;
    const loader = new ModuleLoader({
      roots: [{ path: root, origin: "bundled" }],
      getServices: () => services,
      botVersion: "0.1.0",
      reservedCommands: ["ping"],
    });
    await loader.load();

    expect(loader.command("ping")).toBeUndefined();
    expect(loader.status()[0]?.error).toContain("built-in");
  });

  test("fails a listener whose module does not match", async () => {
    const root = await fixture();
    await writeModule(root, "listener", {
      source: `export default {
        name: "listener",
        displayName: "Listener",
        description: "listener module",
        listeners: [{ name: "bad", event: "messageCreate", module: "other", execute() {} }],
      };`,
    });

    const loader = makeLoader(root);
    await loader.load();

    expect(loader.get("listener")).toBeUndefined();
    expect(loader.status()[0]?.error).toContain("must declare module");
  });

  test("rejects a command builder whose name does not match", async () => {
    const root = await fixture();
    await writeModule(root, "mismatch", {
      source: `export default {
        name: "mismatch",
        displayName: "Mismatch",
        description: "mismatch module",
        commands: [{
          name: "mismatch",
          description: "mismatch",
          module: "mismatch",
          run() {},
          build: () => ({ name: "other" }),
        }],
      };`,
    });

    const loader = makeLoader(root);
    await loader.load();

    expect(loader.command("mismatch")).toBeUndefined();
    expect(loader.status()[0]?.error).toContain("build failed");
  });

  test("skips a module with an unmet dependency", async () => {
    const root = await fixture();
    await writeModule(root, "needs", { dependencies: { absent: "^1.0.0" } });

    const loader = makeLoader(root);
    await loader.load();

    expect(loader.get("needs")).toBeUndefined();
    expect(loader.status()[0]?.error).toContain("missing dependency");
  });

  test("loads dependencies before dependents", async () => {
    const root = await fixture();
    const order: string[] = [];
    const source = (name: string) => `export default {
      name: ${JSON.stringify(name)},
      displayName: ${JSON.stringify(name)},
      description: ${JSON.stringify(`${name} module`)},
      onLoad() { globalThis.__lumiOrder.push(${JSON.stringify(name)}); }
    };`;
    (globalThis as { __lumiOrder?: string[] }).__lumiOrder = order;

    await writeModule(root, "child", {
      dependencies: { base: "^1.0.0" },
      source: source("child"),
    });
    await writeModule(root, "base", { source: source("base") });

    const loader = makeLoader(root);
    await loader.load();

    expect(order).toEqual(["base", "child"]);
  });
});
