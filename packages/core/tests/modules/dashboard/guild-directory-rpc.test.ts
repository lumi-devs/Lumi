import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { Collection, ChannelType } from "discord.js";
import { RpcActions } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { GuildConfigSetManyMax } from "#modules/dashboard/lib/helpers.js";
import {
  clearGuildDirectoryCache,
  registerGuildRpcHandlers,
} from "#modules/dashboard/rpc/guild-rpc.js";

vi.mock("#lib/module-system/Utility.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, getUtility: vi.fn() };
});

import { getUtility } from "#lib/module-system/Utility.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

const MOD_ROLE_ID = "444444444444444444";
const TEXT_CHANNEL_ID = "555555555555555555";
const VOICE_CHANNEL_ID = "666666666666666666";
const THREAD_CHANNEL_ID = "777777777777777777";

function makeGuild() {
  return {
    id: GUILD_ID,
    ownerId: OWNER_ID,
    name: "Test Guild",
    iconURL: vi.fn().mockReturnValue(null),
    bannerURL: vi.fn().mockReturnValue(null),
    memberCount: 3,
    roles: {
      cache: new Collection([
        [
          GUILD_ID,
          {
            id: GUILD_ID,
            name: "@everyone",
            color: 0,
            position: 0,
            permissions: { bitfield: 0n },
          },
        ],
        [
          MOD_ROLE_ID,
          {
            id: MOD_ROLE_ID,
            name: "Mods",
            color: 3447003,
            position: 2,
            permissions: { bitfield: 8n },
          },
        ],
      ]),
    },
    channels: {
      cache: new Collection([
        [
          TEXT_CHANNEL_ID,
          { id: TEXT_CHANNEL_ID, name: "general", type: ChannelType.GuildText },
        ],
        [
          VOICE_CHANNEL_ID,
          { id: VOICE_CHANNEL_ID, name: "lobby", type: ChannelType.GuildVoice },
        ],
        [
          THREAD_CHANNEL_ID,
          {
            id: THREAD_CHANNEL_ID,
            name: "thread",
            type: ChannelType.PublicThread,
          },
        ],
      ]),
    },
    members: {
      fetch: vi.fn(),
      me: { roles: { highest: { id: MOD_ROLE_ID } } },
      cache: new Collection(),
    },
  };
}

describe("guild config batch + directory RPC handlers", () => {
  let guild: any;
  let configUtility: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clearGuildDirectoryCache();

    guild = makeGuild();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;

    (container as any).db = {
      config: {
        getGuildSettings: vi.fn().mockResolvedValue({ prefix: "!" }),
        getAllModuleConfigsForGuild: vi.fn().mockResolvedValue(new Map()),
        deleteModuleConfigKey: vi.fn().mockResolvedValue(undefined),
      },
      modules: {
        areModulesEnabled: vi.fn().mockResolvedValue(new Map()),
      },
    } as any;

    configUtility = {
      setConfig: vi
        .fn()
        .mockImplementation((_g: string, _m: string, _k: string, raw: string) => ({
          coerced: raw,
        })),
    };

    (getUtility as any).mockImplementation((name: string) =>
      name === "config" ? configUtility : null,
    );

    container.stores = {
      get: vi.fn().mockReturnValue({ loaded: () => [] }),
    } as any;

    registerGuildRpcHandlers();
  });

  const handlerFor = (action: string) => {
    const handler = rpcHandlers.get(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: string, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  describe("guild.config.setMany", () => {
    it("writes every entry through the same per-field path", async () => {
      const res = (await call(RpcActions.guildConfigSetMany, {
        moduleName: "security",
        values: { max_bans: "3", window_seconds: "60" },
      })) as any;

      expect(res).toEqual({
        success: true,
        updated: { max_bans: "3", window_seconds: "60" },
      });
      expect(configUtility.setConfig).toHaveBeenCalledTimes(2);
      expect(configUtility.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "security",
        "max_bans",
        "3",
        OWNER_ID,
      );
      expect(configUtility.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "security",
        "window_seconds",
        "60",
        OWNER_ID,
      );
    });

    it("deletes keys whose value is null or empty, like the single-key path", async () => {
      const res = (await call(RpcActions.guildConfigSetMany, {
        moduleName: "mod",
        values: { logChannel: null, other: "" },
      })) as any;

      expect(res).toEqual({
        success: true,
        updated: { logChannel: null, other: null },
      });
      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalledTimes(2);
      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("mixes writes and deletes in one call", async () => {
      const res = (await call(RpcActions.guildConfigSetMany, {
        moduleName: "mod",
        values: { keep: "1", drop: null },
      })) as any;

      expect(res.updated).toEqual({ keep: "1", drop: null });
      expect(configUtility.setConfig).toHaveBeenCalledTimes(1);
      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalledTimes(1);
    });

    it("accepts an empty values object as a no-op", async () => {
      const res = (await call(RpcActions.guildConfigSetMany, {
        moduleName: "mod",
        values: {},
      })) as any;

      expect(res).toEqual({ success: true, updated: {} });
      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects more entries than the per-call cap", async () => {
      const values = Object.fromEntries(
        Array.from({ length: GuildConfigSetManyMax + 1 }, (_, i) => [`k${i}`, "v"]),
      );

      await expect(
        call(RpcActions.guildConfigSetMany, { moduleName: "mod", values }),
      ).rejects.toThrow("at most");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects a non-object values payload", async () => {
      await expect(
        call(RpcActions.guildConfigSetMany, {
          moduleName: "mod",
          values: ["not", "an", "object"],
        }),
      ).rejects.toThrow("must be an object");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an entry the per-field validator would reject", async () => {
      await expect(
        call(RpcActions.guildConfigSetMany, {
          moduleName: "mod",
          values: { "": "v" },
        }),
      ).rejects.toThrow("Bad payload");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects a payload missing the module name", async () => {
      await expect(
        call(RpcActions.guildConfigSetMany, { values: { k: "v" } }),
      ).rejects.toThrow("Bad payload");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an actor without ManageGuild before writing anything", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(
          RpcActions.guildConfigSetMany,
          { moduleName: "mod", values: { k: "v" } },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
      expect(container.db.config.deleteModuleConfigKey).not.toHaveBeenCalled();
    });
  });

  describe("guild.roles.list", () => {
    it("returns only id+name, skipping @everyone, sorted by name", async () => {
      const res = (await call(RpcActions.guildRolesList)) as any;

      expect(res).toEqual({ roles: [{ id: MOD_ROLE_ID, name: "Mods" }] });
    });

    it("serves repeat reads from the short-lived cache", async () => {
      await call(RpcActions.guildRolesList);

      guild.roles.cache.set("888888888888888888", {
        id: "888888888888888888",
        name: "Newcomers",
        color: 0,
        position: 1,
        permissions: { bitfield: 0n },
      });

      const res = (await call(RpcActions.guildRolesList)) as any;
      expect(res.roles).toEqual([{ id: MOD_ROLE_ID, name: "Mods" }]);

      clearGuildDirectoryCache(GUILD_ID);
      const refreshed = (await call(RpcActions.guildRolesList)) as any;
      expect(refreshed.roles).toHaveLength(2);
    });

    it("rejects an actor without ManageGuild", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(RpcActions.guildRolesList, undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.channels.list", () => {
    it("returns only id+name+type for pickable channels", async () => {
      const res = (await call(RpcActions.guildChannelsList)) as any;

      expect(res).toEqual({
        channels: [
          { id: TEXT_CHANNEL_ID, name: "general", type: ChannelType.GuildText },
          { id: VOICE_CHANNEL_ID, name: "lobby", type: ChannelType.GuildVoice },
        ],
      });
    });

    it("rejects an actor without ManageGuild", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(RpcActions.guildChannelsList, undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.dashboard.get trims", () => {
    it("omits the unread module + role fields from the payload", async () => {
      const res = (await call(RpcActions.guildDashboardGet)) as any;

      for (const m of res.modules) {
        expect(m).not.toHaveProperty("conflicts");
        expect(m).not.toHaveProperty("dependencies");
      }
      for (const r of res.roles) {
        expect(r).not.toHaveProperty("color");
      }
      expect(res.roles[0]).toMatchObject({
        id: MOD_ROLE_ID,
        name: "Mods",
        position: 2,
        permissions: "8",
        isBotRole: true,
      });
    });
  });
});
