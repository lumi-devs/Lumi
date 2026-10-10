import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "@lumi/lib/rpc/registry.js";
import { FeatureFlagRepository } from "@lumi/lib/prisma/repositories/feature-flag-repository.js";
import { createMockPrismaClient } from "../mocks/prisma.js";

const BOT_OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const GUILD_ID = "123456789012345678";

describe("system.flags RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = createMockPrismaClient();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = {
      application: { owner: { id: BOT_OWNER_ID } },
      guilds: { cache: new Map() },
    } as any;

    (container as any).invalidation = { invalidate: vi.fn() };

    const valkey = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
    };

    const db = {} as any;
    db.featureFlags = new FeatureFlagRepository(
      prisma as any,
      valkey as any,
      container.logger,
      db,
    );
    (container as any).db = db;

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (
    action: RpcActionName,
    data?: unknown,
    ...actorRest: [string | undefined] | []
  ) =>
    handlerFor(action)({
      id: "req",
      action,
      actorId: actorRest.length > 0 ? actorRest[0] : BOT_OWNER_ID,
      data,
    });

  for (const action of [
    "system.flags.list",
    "system.flags.set",
    "system.flags.override.set",
    "system.flags.override.delete",
  ] as const) {
    it(`${action} rejects anyone who is not a bot owner`, async () => {
      await expect(call(action, {}, INTRUDER_ID)).rejects.toThrow(/Bot Owner/);
      await expect(call(action, {}, undefined)).rejects.toThrow(/Bot Owner/);
    });
  }

  describe("system.flags.set", () => {
    it("creates a flag, recording the actor as updatedBy", async () => {
      const result = (await call("system.flags.set", {
        key: "new-ui",
        description: "New UI rollout",
        enabled: true,
        rolloutPercent: 25,
      })) as any;

      expect(result.success).toBe(true);
      expect(result.flag).toMatchObject({
        key: "new-ui",
        description: "New UI rollout",
        enabled: true,
        rolloutPercent: 25,
        updatedBy: BOT_OWNER_ID,
      });
    });

    it("updates an existing flag in place", async () => {
      await call("system.flags.set", {
        key: "new-ui",
        enabled: false,
        rolloutPercent: 0,
      });

      const result = (await call("system.flags.set", {
        key: "new-ui",
        enabled: true,
        rolloutPercent: 50,
      })) as any;

      expect(result.flag.enabled).toBe(true);
      expect(result.flag.rolloutPercent).toBe(50);

      const list = (await call("system.flags.list")) as any;
      expect(list.flags).toHaveLength(1);
    });

    it("rejects an out-of-range rolloutPercent", async () => {
      await expect(
        call("system.flags.set", { key: "new-ui", enabled: true, rolloutPercent: 101 }),
      ).rejects.toThrow();
    });
  });

  describe("system.flags.list", () => {
    it("lists every flag", async () => {
      await call("system.flags.set", { key: "a", enabled: true, rolloutPercent: 10 });
      await call("system.flags.set", { key: "b", enabled: false, rolloutPercent: 0 });

      const result = (await call("system.flags.list")) as any;
      expect(result.flags.map((f: any) => f.key).sort()).toEqual(["a", "b"]);
    });
  });

  describe("system.flags.override", () => {
    it("sets and then deletes a per-guild override", async () => {
      await call("system.flags.set", { key: "new-ui", enabled: false, rolloutPercent: 0 });

      const setResult = (await call("system.flags.override.set", {
        flagKey: "new-ui",
        guildId: GUILD_ID,
        enabled: true,
      })) as any;
      expect(setResult.success).toBe(true);
      expect(setResult.override).toMatchObject({
        flagKey: "new-ui",
        guildId: GUILD_ID,
        enabled: true,
      });

      const deleteResult = (await call("system.flags.override.delete", {
        flagKey: "new-ui",
        guildId: GUILD_ID,
      })) as any;
      expect(deleteResult.success).toBe(true);
    });

    it("deleting a non-existent override reports failure without throwing", async () => {
      const result = (await call("system.flags.override.delete", {
        flagKey: "ghost",
        guildId: GUILD_ID,
      })) as any;
      expect(result.success).toBe(false);
    });
  });
});
