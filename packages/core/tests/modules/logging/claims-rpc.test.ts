import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { LogClaimCodeTtlMs } from "#lib/logging/claims.js";
import { RedisKeys } from "#lib/database/redis.js";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

describe("logging module claim RPC handlers", () => {
  let guild: any;
  let strings: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    strings = new Map();

    guild = {
      id: GUILD_ID,
      ownerId: OWNER_ID,
      members: { fetch: vi.fn() },
    };

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;

    (container as any).redis = {
      set: vi.fn((key: string, value: string, ...args: unknown[]) => {
        if (args.includes("NX") && strings.has(key)) return Promise.resolve(null);
        strings.set(key, value);
        return Promise.resolve("OK");
      }),
      get: vi.fn((key: string) => Promise.resolve(strings.get(key) ?? null)),
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
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

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
