import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "@lumi/lib/rpc/registry.js";
import { TempVcRepository } from "@lumi/modules/tempvc/data/TempVcRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";
import { repositoryCache } from "@lumi/lib/cache/cache-store.js";
import { FakeDiscordRestPort } from "@lumi/lib/discord/fake-rest-port.js";

let utilities: Map<string, unknown>;
let loadedModules: Set<string>;
vi.mock("@lumi/lib/module-system/utility.js", () => ({
  getUtility: vi.fn().mockImplementation((name: string) => {
    const utility = utilities.get(name);
    if (!utility) throw new Error(`Utility "${name}" is not loaded`);
    return utility;
  }),
  tryGetUtility: vi.fn().mockImplementation((name: string) => utilities.get(name)),
}));

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";
const MESSAGE_ID = "555555555555555555";

function everyoneRole(permissions = "0") {
  return { id: GUILD_ID, permissions };
}

/** Wires a `DiscordRestPort` fake to answer `checkGuildManagerRest`'s guild/member lookups. */
function mockRest(opts: {
  ownerId: string;
  roles?: { id: string; permissions: string }[];
  memberRoles?: string[];
}): FakeDiscordRestPort {
  const fake = new FakeDiscordRestPort();
  fake.seedGuild({
    id: GUILD_ID,
    owner_id: opts.ownerId,
    roles: opts.roles ?? [everyoneRole()],
  } as any);
  fake.seedMember(GUILD_ID, { user: { id: INTRUDER_ID }, roles: opts.memberRoles ?? [] } as any);
  return fake;
}

describe("tempvc module RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;
  let tempvc: { addGenerator: ReturnType<typeof vi.fn>; removeGenerator: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = createMockPrismaClient();

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
    (container as any).discordRest = mockRest({ ownerId: OWNER_ID });

    repositoryCache.clear();
    (container as any).valkey = { get: vi.fn().mockResolvedValue(null), setex: vi.fn() };

    const db = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
    } as any;
    db.tempvc = new TempVcRepository(prisma as any, {} as any, container.logger, db);
    (container as any).db = db;

    tempvc = {
      addGenerator: vi.fn().mockResolvedValue(undefined),
      removeGenerator: vi.fn().mockResolvedValue(true),
    };

    utilities = new Map<string, unknown>([["tempvc", tempvc]]);
    loadedModules = new Set(["tempvc"]);

    (container as any).moduleStore = {
      get: (key: string) => (loadedModules.has(key) ? { name: key } : undefined),
      loaded: () => [...loadedModules].map((name) => ({ name })),
    };

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: RpcActionName, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const denyPermissions = () => {
    (container as any).discordRest = mockRest({ ownerId: OWNER_ID, memberRoles: [] });
  };

  describe("guild.tempvc.generators", () => {
    it("lists only this guild's generators", async () => {
      prisma.$seed("tempVcGenerator", [
        { guildId: GUILD_ID, channelId: CHANNEL_ID, name: "Gaming {}", limit: 5 },
        { guildId: "999999999999999999", channelId: MESSAGE_ID, name: "Other {}", limit: 0 },
      ]);

      const res = (await call("guild.tempvc.generators.list")) as any;

      expect(res.generators).toEqual([
        { channelId: CHANNEL_ID, name: "Gaming {}", limit: 5 },
      ]);
    });

    it("upserts through the tempvc service so its registry is invalidated", async () => {
      const res = (await call("guild.tempvc.generators.set", {
        channelId: CHANNEL_ID,
        name: "Gaming {}",
        limit: 5,
      })) as any;

      expect(container.db.ensureGuild).toHaveBeenCalledWith(GUILD_ID);
      expect(tempvc.addGenerator).toHaveBeenCalledWith(container, GUILD_ID, CHANNEL_ID, {
        name: "Gaming {}",
        limit: 5,
      });
      expect(res).toEqual({ success: true, channelId: CHANNEL_ID, deleted: false });
    });

    it("defaults the user limit to unlimited", async () => {
      await call("guild.tempvc.generators.set", {
        channelId: CHANNEL_ID,
        name: "Gaming {}",
      });

      expect(tempvc.addGenerator).toHaveBeenCalledWith(container, GUILD_ID, CHANNEL_ID, {
        name: "Gaming {}",
        limit: 0,
      });
    });

    it("deletes the generator when name is null", async () => {
      const res = (await call("guild.tempvc.generators.set", {
        channelId: CHANNEL_ID,
        name: null,
      })) as any;

      expect(tempvc.removeGenerator).toHaveBeenCalledWith(container, GUILD_ID, CHANNEL_ID);
      expect(tempvc.addGenerator).not.toHaveBeenCalled();
      expect(res).toEqual({ success: true, channelId: CHANNEL_ID, deleted: true });
    });

    it("throws when the tempvc module is unloaded", async () => {
      utilities.delete("tempvc");
      loadedModules.delete("tempvc");

      await expect(
        call("guild.tempvc.generators.set", {
          channelId: CHANNEL_ID,
          name: "Gaming {}",
        }),
      ).rejects.toThrow("The tempvc module is not loaded");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(
          "guild.tempvc.generators.set",
          { channelId: CHANNEL_ID, name: "Gaming {}" },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(tempvc.addGenerator).not.toHaveBeenCalled();
    });
  });

  describe("guild.tempvc.records.list", () => {
    it("projects live records with serialized dates", async () => {
      prisma.$seed("tempVcRecord", [
        {
          guildId: GUILD_ID,
          channelId: CHANNEL_ID,
          ownerId: OWNER_ID,
          generatorId: MESSAGE_ID,
          name: "Gaming 1",
          number: 1,
          locked: true,
          hidden: false,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          guildId: "999999999999999999",
          channelId: MESSAGE_ID,
          ownerId: OWNER_ID,
          generatorId: MESSAGE_ID,
          name: "Other 1",
          number: 1,
          locked: false,
          hidden: false,
          createdAt: new Date(),
        },
      ]);

      const res = (await call("guild.tempvc.records.list")) as any;

      expect(res.records).toEqual([
        {
          channelId: CHANNEL_ID,
          ownerId: OWNER_ID,
          generatorId: MESSAGE_ID,
          name: "Gaming 1",
          number: 1,
          locked: true,
          hidden: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call("guild.tempvc.records.list", undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });
});
