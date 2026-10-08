import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import { promises as fs } from "node:fs";
import path from "node:path";

const mockedReadManifest = vi.fn();
const mockedMetaFromManifest = vi.fn();

vi.mock("#lib/module-system/manifest.js", () => ({
  readManifest: mockedReadManifest,
  metaFromManifest: mockedMetaFromManifest,
}));

import { ModuleStore } from "#lib/module-system/ModuleStore.js";

type ModSpec = {
  dependencies?: string[];
  conflicts?: string[];
  disableable?: boolean;
  version?: string;
};

/**
 * Wire the mocked FS + manifest layer so `discover()` finds one module dir
 * per key under /test/modules.
 */
function setupModules(mods: Record<string, ModSpec>) {
  const names = Object.keys(mods);
  vi.spyOn(fs, "access").mockResolvedValue(undefined);
  vi.spyOn(fs, "readdir").mockImplementation(
    (p: any) =>
      Promise.resolve(names.includes(path.basename(String(p))) ? [] : names) as any,
  );
  vi.spyOn(fs, "stat").mockImplementation(
    (p: any) =>
      Promise.resolve({
        isDirectory: () => names.includes(path.basename(String(p))),
        isFile: () => false,
      }) as any,
  );
  mockedReadManifest.mockImplementation((dir: string) => {
    const name = path.basename(dir);
    if (!names.includes(name)) return Promise.resolve(null);
    return Promise.resolve({
      name,
      displayName: name,
      emoji: "",
      description: "",
      version: "0.0.0",
      targetUtility: "worker" as const,
      subStores: [],
      configFields: [],
      ...mods[name],
    });
  });
}

describe("ModuleStore", () => {
  let store: ModuleStore;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedMetaFromManifest.mockImplementation((m: any) => ({
      name: m.name,
      displayName: m.name,
      emoji: "",
      description: "",
      version: m.version ?? "0.0.0",
      dependencies: m.dependencies ?? [],
      conflicts: m.conflicts ?? [],
      disableable: m.disableable,
    }));

    (container as any).db = {
      modules: {
        getGlobalModuleStates: vi.fn().mockResolvedValue(new Map()),
        isModuleGlobalEnabled: vi.fn(),
        setModuleGlobalEnabled: vi.fn(),
      },
    };
    container.logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

    store = new ModuleStore(container);
    store.addRoot(new URL("file:///test/modules"));
  });

  it("discovers modules in a root directory", async () => {
    setupModules({ afk: {}, raids: {} });
    await store.discover();

    expect(store.getRecord("afk")).toBeDefined();
    expect(store.getRecord("raids")).toBeDefined();
    expect(store.getRecord("afk")!.enabled).toBe(true);
  });

  it("disables a module with a missing dependency and keeps the rest", async () => {
    setupModules({ b: { dependencies: ["ghost"] }, a: {} });
    await store.discover();

    expect(store.getRecord("b")!.enabled).toBe(false);
    expect(store.getRecord("b")!.state).toBe("failed");
    expect(store.getRecord("b")!.failureReason).toMatch(/missing dependency 'ghost'/);
    expect(store.getRecord("a")!.enabled).toBe(true);
  });

  it("disables (but does not throw for) modules with a circular dependency", async () => {
    setupModules({ a: { dependencies: ["b"] }, b: { dependencies: ["a"] } });
    await expect(store.discover()).resolves.toBeUndefined();

    expect(store.getRecord("a")!.enabled).toBe(false);
    expect(store.getRecord("a")!.state).toBe("failed");
    expect(store.getRecord("b")!.enabled).toBe(false);
    expect(store.getRecord("b")!.state).toBe("failed");
  });

  it("disables a module that conflicts with a loaded one", async () => {
    setupModules({ a: { conflicts: ["b"] }, b: {} });
    await store.discover();

    const states = [store.getRecord("a")!.enabled, store.getRecord("b")!.enabled];
    expect(states).toContain(false);
  });

  it("fails module load when the index has no module definition", async () => {
    setupModules({ broken: {} });
    await store.discover();

    await expect(store.loadModule("broken")).rejects.toThrow(/failed to load/);
    expect(store.getRecord("broken")!.enabled).toBe(false);
    expect(store.getRecord("broken")!.state).toBe("failed");
  });

  it("throws for unknown modules", async () => {
    setupModules({ afk: {} });
    await store.discover();

    await expect(store.loadModule("ghost")).rejects.toThrow(/not found/);
  });

  it("unload marks the module disabled when its directory still exists", async () => {
    setupModules({ afk: {} });
    await store.discover();

    await store.unload("afk");

    expect(store.getRecord("afk")!.enabled).toBe(false);
    expect(store.getRecord("afk")!.state).toBe("disabled");
  });

  it("unload deletes the record entirely when the module directory no longer exists", async () => {
    setupModules({ afk: {} });
    await store.discover();

    vi.spyOn(fs, "access").mockRejectedValue(new Error("gone"));
    await store.unload("afk");

    expect(store.getRecord("afk")).toBeUndefined();
  });

  it("setEnabled refuses to disable a non-disableable module", async () => {
    setupModules({ core: { disableable: false } });
    await store.discover();

    await expect(store.setEnabled("core", false)).rejects.toThrow(/essential/);
  });

  it("reports non-disableable modules via isModuleDisableable", () => {
    setupModules({});
    return store.discover().then(() => {
      expect(store.isModuleDisableable("anything-missing")).toBe(true);
    });
  });
});
