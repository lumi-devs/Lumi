import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { LogClaimCodeTtlMs } from "#modules/logging/services/claims.js";
import { RedisKeys } from "#lib/database/redis.js";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

function everyoneRole(permissions = "0") {
  return { id: GUILD_ID, permissions };
}

function memberWith(roleIds: string[]) {
  return { roles: roleIds };
}

function mockRest(opts: {
  guild?: { owner_id: string; roles: { id: string; permissions: string }[] } | null;
  member?: unknown;
}) {
  const get = vi.fn().mockImplementation((route: string) => {
    if (route === `/guilds/${GUILD_ID}`) {
      if (opts.guild === null || opts.guild === undefined) {
        return Promise.reject(new Error("Unknown Guild"));
      }
      return Promise.resolve({ id: GUILD_ID, ...opts.guild });
    }
    if (route.startsWith(`/guilds/${GUILD_ID}/members/`)) {
      if (opts.member === undefined) return Promise.reject(new Error("Unknown Member"));
      return Promise.resolve(opts.member);
    }
    return Promise.reject(new Error(`Unexpected route: ${route}`));
  });
  return { rest: { get } };
}

describe("logging module claim RPC handlers", () => {
  let strings: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    strings = new Map();
    repositoryCache.clear();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = mockRest({
      guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
      member: memberWith([]),
    }) as any;

    (container as any).redis = {
      set: vi.fn((key: string, value: string, ...args: unknown[]) => {
        if (args.includes("NX") && strings.has(key)) return Promise.resolve(null);
        strings.set(key, value);
        return Promise.resolve("OK");
      }),
      get: vi.fn((key: string) => Promise.resolve(strings.get(key) ?? null)),
      setex: vi.fn(),
    } as any;

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: RpcActionName, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId });

  describe("guild.logClaims.issue", () => {
    it("rejects an actor without ManageGuild", async () => {
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
      }) as any;

      await expect(
        call("guild.logClaims.issue", INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });

    it("issues a 6-char code with its TTL", async () => {
      const res = (await call("guild.logClaims.issue")) as any;

      expect(res.code).toMatch(/^[A-Z2-9]{6}$/);
      expect(res.expiresIn).toBe(LogClaimCodeTtlMs);
      expect(strings.get(RedisKeys.logClaimCode(GUILD_ID, res.code))).toBe(
        OWNER_ID,
      );
    });
  });
});
