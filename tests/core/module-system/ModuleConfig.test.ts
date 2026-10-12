import { describe, it, expect, beforeEach, vi } from "bun:test";
import { defineModuleConfig } from "#src/lib/module-system/ModuleConfig.js";
import type { Container } from "#src/lib/Services.js";
import { container } from "#src/lib/Services.js";

const Defaults = {
  counter: 0,
  greeting: "hi",
  nested: { a: { b: 1 }, list: ["x", "y"] },
};

function createMockConfig() {
  const store = new Map<string, unknown>();
  const keyOf = (scope: string, scopeId: string, key: string) =>
    `${scope}:${scopeId}:${key}`;
  return {
    store,
    getScopedConfig: vi.fn(
      async (_guildId: string, _module: string, scope: string, scopeId: string, key: string) =>
        store.has(keyOf(scope, scopeId, key)) ? store.get(keyOf(scope, scopeId, key)) : null,
    ),
    setScopedConfig: vi.fn(
      async (
        _guildId: string,
        _module: string,
        scope: string,
        scopeId: string,
        key: string,
        value: unknown,
      ) => {
        store.set(keyOf(scope, scopeId, key), value);
      },
    ),
    getAllScopedConfig: vi.fn(
      async (_guildId: string, _module: string, scope: string, scopeId: string) => {
        const out: Record<string, unknown> = {};
        const prefix = `${scope}:${scopeId}:`;
        for (const [k, v] of store) {
          if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
        }
        return out;
      },
    ),
    deleteScopedConfigKey: vi.fn(
      async (_guildId: string, _module: string, scope: string, scopeId: string, key: string) => {
        store.delete(keyOf(scope, scopeId, key));
      },
    ),
  };
}

describe("ScopedConfig nested access", () => {
  let mockConfig: ReturnType<typeof createMockConfig>;
  let services: Container;
  let events: string[];

  beforeEach(() => {
    mockConfig = createMockConfig();
    services = { db: { config: mockConfig } } as unknown as Container;
    events = [];
    (container as any).valkey = {
      set: vi.fn(async () => {
        events.push("acquire");
        return "OK";
      }),
      eval: vi.fn(async () => {
        events.push("release");
        return 1;
      }),
    };
  });

  describe("getPath", () => {
    it("reads a nested value through the defaults fallback", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      expect(await cfg.getPath("nested", ["a", "b"])).toBe(1);
    });

    it("reads array elements by index", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      expect(await cfg.getPath("nested", ["list", "1"])).toBe("y");
    });

    it("returns undefined for missing leaves", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      expect(await cfg.getPath("nested", ["a", "zzz"])).toBeUndefined();
    });

    it("returns undefined when walking through a primitive", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      expect(await cfg.getPath("nested", ["a", "b", "c"])).toBeUndefined();
    });

    it("returns undefined for non-integer array segments", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      expect(await cfg.getPath("nested", ["list", "nope"])).toBeUndefined();
    });

    it("returns the whole value for an empty path", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      expect(await cfg.getPath("greeting", [])).toBe("hi");
    });

    it("reads stored values over defaults", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      await cfg.set("nested", { a: { b: 42 }, list: [] });
      expect(await cfg.getPath("nested", ["a", "b"])).toBe(42);
    });
  });

  describe("setPath", () => {
    it("sets a nested leaf and preserves siblings", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      await cfg.setPath("nested", ["a", "b"], 7);
      expect(await cfg.getPath("nested", ["a", "b"])).toBe(7);
      expect(await cfg.getPath("nested", ["list", "0"])).toBe("x");
    });

    it("creates intermediate objects when missing", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      await cfg.set("nested", { a: { b: 1 }, list: [] });
      await cfg.setPath("nested", ["deep", "deeper", "leaf"], true);
      expect(await cfg.getPath("nested", ["deep", "deeper", "leaf"])).toBe(true);
    });

    it("updates array elements by index", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      await cfg.setPath("nested", ["list", "0"], "z");
      expect(await cfg.get("nested")).toEqual({ a: { b: 1 }, list: ["z", "y"] });
    });

    it("replaces the whole key for an empty path", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      await cfg.setPath("greeting", [], "yo");
      expect(await cfg.get("greeting")).toBe("yo");
    });

    it("leaves module defaults untouched", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      await cfg.setPath("nested", ["a", "b"], 99);
      expect(Defaults.nested.a.b).toBe(1);
    });
  });

  describe("mutate", () => {
    it("applies a sync fn, persists, and returns the result", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      const next = await cfg.mutate("counter", (current) => current + 1);
      expect(next).toBe(1);
      expect(await cfg.get("counter")).toBe(1);
    });

    it("applies an async fn starting from defaults", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      const next = await cfg.mutate("greeting", async (current) => `${current}!`);
      expect(next).toBe("hi!");
      expect(await cfg.get("greeting")).toBe("hi!");
    });

    it("hands fn a copy so in-place edits cannot corrupt defaults", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      const next = await cfg.mutate("nested", (current) => {
        current.list.push("z");
        return current;
      });
      expect(next.list).toEqual(["x", "y", "z"]);
      expect(Defaults.nested.list).toEqual(["x", "y"]);
    });

    it("holds the guild lock across read-modify-write and releases it", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      await cfg.mutate("counter", (current) => current + 5);
      expect(events).toEqual(["acquire", "release"]);
    });

    it("releases the lock and keeps the old value when fn throws", async () => {
      const cfg = defineModuleConfig("test-module", Defaults).forGuild(services, "g1");
      await cfg.set("counter", 3);
      await expect(cfg.mutate("counter", () => Promise.reject(new Error("boom")))).rejects.toThrow(
        "boom",
      );
      expect(await cfg.get("counter")).toBe(3);
      expect(events).toEqual(["acquire", "release"]);
    });
  });
});
