import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lib/Services.js";
import type { RpcActionName } from "@contracts/rpc/Index.ts";
import { LogClaimCodeTtlMs } from "@modules/logging/services/Claims.js";
import { RedisKeys } from "@redis/Store.js";
import { getRpcHandler, registerRpcHandlers } from "@rpc/Registry.js";
import { repositoryCache } from "@cache/CacheStore.js";
import { FakeDiscordRestPort } from "../../helpers/FakeRestPort.js";
import { createMemoryRedis, type MemoryRedis } from "../../mocks/MemoryRedis.js";

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
}): FakeDiscordRestPort {
  const fake = new FakeDiscordRestPort();
  if (opts.guild) fake.seedGuild({ id: GUILD_ID, ...opts.guild } as any);
  if (opts.member !== undefined) {
    fake.seedMember(GUILD_ID, { user: { id: INTRUDER_ID }, ...(opts.member as object) } as any);
  }
  return fake;
}

describe("logging module claim RPC handlers", () => {
  let redis: MemoryRedis;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = createMemoryRedis();
    repositoryCache.clear();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).discordRest = mockRest({
      guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
      member: memberWith([]),
    });

    (container as any).redis = redis;

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
      expect(redis.$store.get(RedisKeys.logClaimCode(GUILD_ID, res.code))).toBe(
        OWNER_ID,
      );
    });
  });
});
