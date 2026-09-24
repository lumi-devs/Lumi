import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const MANAGER_ID = "222222222222222222";
const INTRUDER_ID = "333333333333333333";
const MOD_ROLE_ID = "444444444444444444";
const BOT_ID = "999999999999999999";

/** discord.js's ManageGuild bit, used to build a fake role permission string. */
const ManageGuildBit = (1n << 5n).toString();

const afkModule = {
  meta: {
    name: "afk",
    displayName: "AFK",
    emoji: "💤",
    description: "Away status",
    version: "1.0.0",
    configFields: [{ key: "timeout", label: "Timeout", type: "NUMBER", description: "", default: 5 }],
  },
};

describe("dashboard module guild read RPC handlers", () => {
  let restGet: ReturnType<typeof vi.fn>;
  let everyoneRole: { id: string; name: string; color: number; position: number; permissions: string };
  let modRole: { id: string; name: string; color: number; position: number; permissions: string };
  let channels: { id: string; name: string; type: number }[];
  let memberSample: unknown[];

  beforeEach(() => {
    vi.clearAllMocks();
    repositoryCache.clear();

    everyoneRole = { id: GUILD_ID, name: "@everyone", color: 0, position: 0, permissions: "0" };
    modRole = { id: MOD_ROLE_ID, name: "Mods", color: 3447003, position: 2, permissions: ManageGuildBit };
    channels = [
      { id: "555555555555555555", name: "general", type: 0 },
      { id: "777777777777777777", name: "thread", type: 11 },
    ];
    memberSample = [];

    restGet = vi.fn().mockImplementation((route: string) => {
      if (route === `/guilds/${GUILD_ID}`) {
        return Promise.resolve({
          id: GUILD_ID,
          owner_id: OWNER_ID,
          name: "Test Guild",
          icon: "icon-hash",
          banner: "banner-hash",
          approximate_member_count: 3,
          roles: [everyoneRole, modRole],
        });
      }
      if (route === `/guilds/${GUILD_ID}/roles`) {
        return Promise.resolve([everyoneRole, modRole]);
      }
      if (route === `/guilds/${GUILD_ID}/channels`) {
        return Promise.resolve(channels);
      }
      if (route === `/guilds/${GUILD_ID}/members`) {
        return Promise.resolve(memberSample);
      }
      if (route === `/guilds/${GUILD_ID}/members/${BOT_ID}`) {
        return Promise.resolve({ roles: [MOD_ROLE_ID], user: { id: BOT_ID, username: "lumi", bot: true } });
      }
      if (route === `/guilds/${GUILD_ID}/members/${MANAGER_ID}`) {
        return Promise.resolve({ roles: [MOD_ROLE_ID] });
      }
      if (route === `/guilds/${GUILD_ID}/members/${INTRUDER_ID}`) {
        return Promise.resolve({ roles: [] });
      }
      return Promise.reject(new Error(`Unexpected route: ${route}`));
    });

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = {
      rest: {
        get: restGet,
        cdn: {
          icon: vi.fn((id: string, hash: string) => `https://cdn/${id}/icon/${hash}.png`),
          banner: vi.fn((id: string, hash: string) => `https://cdn/${id}/banner/${hash}.png`),
        },
      },
      user: { id: BOT_ID },
    } as any;

    (container as any).redis = { get: vi.fn().mockResolvedValue(null), setex: vi.fn() };

    (container as any).db = {
      config: {
        getGuildSettings: vi.fn().mockResolvedValue({ prefix: "!", locale: "en-US" }),
        getAllModuleConfig: vi.fn().mockResolvedValue({}),
      },
      modules: {
        areModulesEnabled: vi.fn().mockResolvedValue(new Map([["afk", false]])),
      },
    } as any;

    container.stores = {
      get: vi.fn().mockReturnValue({
        loaded: () => [afkModule],
        get: (name: string) => (name === "afk" ? afkModule : undefined),
        isAddonModule: () => false,
      }),
    } as any;

    registerRpcHandlers();
  });

  const call = (action: RpcActionName, actorId: string | undefined, data?: unknown, guildId?: string) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler({ id: "req", action, guildId: guildId ?? GUILD_ID, actorId, data });
  };

  describe("guild.shell.get", () => {
    it("rejects an actor who is neither the guild owner nor has ManageGuild/Administrator", async () => {
      await expect(call("guild.shell.get", INTRUDER_ID)).rejects.toThrow(
        "Missing ManageGuild permission",
      );
      expect(container.db.config.getGuildSettings).not.toHaveBeenCalled();
    });

    it("returns identity, settings and module manifests for the guild owner", async () => {
      const result = (await call("guild.shell.get", OWNER_ID)) as any;

      expect(result.name).toBe("Test Guild");
      expect(result.memberCount).toBe(3);
      expect(result.icon).toBe("https://cdn/123456789012345678/icon/icon-hash.png");
      expect(result.banner).toBe("https://cdn/123456789012345678/banner/banner-hash.png");
      expect(result.settings.prefix).toBe("!");
      expect(container.db.config.getGuildSettings).toHaveBeenCalledWith(GUILD_ID);
      expect(restGet).not.toHaveBeenCalledWith(`/guilds/${GUILD_ID}/members/${OWNER_ID}`);
      expect(result.modules).toEqual([
        {
          name: "afk",
          displayName: "AFK",
          emoji: "💤",
          description: "Away status",
          short: undefined,
          endUserDataStatement: undefined,
          version: "1.0.0",
          conflicts: [],
          dependencies: [],
          enabled: false,
          configFields: afkModule.meta.configFields,
          isAddon: false,
          category: "System",
          dashboardHref: null,
        },
      ]);
      expect(result.modules[0]).not.toHaveProperty("config");
    });

    it("lets a non-owner actor with ManageGuild through", async () => {
      const result = (await call("guild.shell.get", MANAGER_ID)) as any;

      expect(result.name).toBe("Test Guild");
      expect(restGet).toHaveBeenCalledWith(`/guilds/${GUILD_ID}/members/${MANAGER_ID}`);
    });
  });

  describe("guild.module.get", () => {
    it("returns one module with its config values filled from defaults", async () => {
      const result = (await call("guild.module.get", OWNER_ID, { module: "afk" })) as any;

      expect(result.module.name).toBe("afk");
      expect(result.module.enabled).toBe(false);
      expect(result.module.config).toEqual({ timeout: 5 });
      expect(container.db.config.getAllModuleConfig).toHaveBeenCalledWith(GUILD_ID, "afk");
    });

    it("prefers stored values over defaults", async () => {
      (container.db.config.getAllModuleConfig as any).mockResolvedValue({ timeout: 30 });

      const result = (await call("guild.module.get", OWNER_ID, { module: "afk" })) as any;

      expect(result.module.config).toEqual({ timeout: 30 });
    });

    it("answers null for a module that is not loaded", async () => {
      await expect(
        call("guild.module.get", OWNER_ID, { module: "ghost" }),
      ).resolves.toEqual({ module: null });
      expect(container.db.config.getAllModuleConfig).not.toHaveBeenCalled();
    });
  });

  describe("guild.entities.get", () => {
    it("returns pickable roles and channels with the fields pickers need", async () => {
      const result = (await call("guild.entities.get", OWNER_ID)) as any;

      expect(result.roles).toEqual([
        {
          id: MOD_ROLE_ID,
          name: "Mods",
          color: 3447003,
          position: 2,
          permissions: ManageGuildBit,
          isBotRole: true,
        },
      ]);
      expect(result.channels).toEqual([
        { id: "555555555555555555", name: "general", type: 0 },
      ]);
      expect(result.members).toEqual([]);
    });

    it("samples non-bot members from a single REST members page", async () => {
      memberSample = [
        { user: { id: "1", username: "alice", bot: false }, nick: null },
        { user: { id: "2", username: "beep-bot", bot: true }, nick: null },
        { user: { id: "3", username: "bob", global_name: "Bobby", bot: false }, nick: "Bobbo" },
      ];

      const result = (await call("guild.entities.get", OWNER_ID)) as any;

      expect(result.members).toEqual([
        { id: "1", username: "alice", displayName: "alice" },
        { id: "3", username: "bob", displayName: "Bobbo" },
      ]);
      expect(restGet).toHaveBeenCalledWith(
        `/guilds/${GUILD_ID}/members`,
        expect.objectContaining({ query: expect.any(URLSearchParams) }),
      );
    });
  });

  describe("guild.summaries.list", () => {
    it("rejects a request with no actorId", async () => {
      await expect(
        call("guild.summaries.list", undefined, { guildIds: [GUILD_ID] }),
      ).rejects.toThrow("actorId is required");
    });

    it("omits guilds the actor cannot manage instead of failing the batch", async () => {
      const result = (await call("guild.summaries.list", INTRUDER_ID, {
        guildIds: [GUILD_ID],
      })) as any;

      expect(result).toEqual({ summaries: [] });
    });
  });
});
