import { describe, expect, it, vi } from "vitest";
import {
  type UnderlyingDataHelper,
  createScopedDataStore,
} from "../../packages/module-kit/src/data.js";

describe("ScopedDataStore", () => {
  function createMockHelper(): {
    helper: UnderlyingDataHelper;
    store: Map<string, unknown>;
  } {
    const store = new Map<string, unknown>();
    const helper: UnderlyingDataHelper = {
      get: vi.fn(async (guildId, moduleName, targetId, key) => {
        const fullKey = `${guildId}:${moduleName}:${targetId}:${key}`;
        return (store.get(fullKey) as any) ?? null;
      }),
      set: vi.fn(async (guildId, moduleName, targetId, key, value) => {
        const fullKey = `${guildId}:${moduleName}:${targetId}:${key}`;
        store.set(fullKey, value);
      }),
      delete: vi.fn(async (guildId, moduleName, targetId, key) => {
        const fullKey = `${guildId}:${moduleName}:${targetId}:${key}`;
        const existed = store.has(fullKey);
        store.delete(fullKey);
        return existed ? 1 : 0;
      }),
    };
    return { helper, store };
  }

  it("partitions keys across guild, user, member, and global scopes", async () => {
    const { helper } = createMockHelper();
    const data = createScopedDataStore(helper, "economy");

    await data.guild("g1").set("taxRate", 0.05);
    await data.user("u1").set("balance", 100);
    await data.member("g1", "u1").set("level", 5);
    await data.global().set("maintenance", false);

    expect(await data.guild("g1").get("taxRate")).toBe(0.05);
    expect(await data.user("u1").get("balance")).toBe(100);
    expect(await data.member("g1", "u1").get("level")).toBe(5);
    expect(await data.global().get("maintenance")).toBe(false);

    expect(helper.set).toHaveBeenCalledWith(
      "g1",
      "economy",
      "guild",
      "taxRate",
      0.05,
      undefined,
    );
    expect(helper.set).toHaveBeenCalledWith(
      "global",
      "economy",
      "u1",
      "balance",
      100,
      undefined,
    );
    expect(helper.set).toHaveBeenCalledWith(
      "g1",
      "economy",
      "u1",
      "level",
      5,
      undefined,
    );
    expect(helper.set).toHaveBeenCalledWith(
      "global",
      "economy",
      "global",
      "maintenance",
      false,
      undefined,
    );
  });

  it("returns default values when key is missing", async () => {
    const { helper } = createMockHelper();
    const data = createScopedDataStore(helper, "trivia");

    const missingWithoutDefault = await data.guild("g1").get("streak");
    expect(missingWithoutDefault).toBeNull();

    const withDefault = await data.guild("g1").get("streak", 0);
    expect(withDefault).toBe(0);

    const withObjectDefault = await data.user("u1").get("stats", { wins: 0 });
    expect(withObjectDefault).toEqual({ wins: 0 });
  });

  it("handles delete properly and returns boolean", async () => {
    const { helper } = createMockHelper();
    const data = createScopedDataStore(helper, "moderation");

    await data.guild("g1").set("rule", "no spam");
    const deleted = await data.guild("g1").delete("rule");
    expect(deleted).toBe(true);

    const deletedAgain = await data.guild("g1").delete("rule");
    expect(deletedAgain).toBe(false);

    const remaining = await data.guild("g1").get("rule");
    expect(remaining).toBeNull();
  });
});
