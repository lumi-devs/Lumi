import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { Collection } from "discord.js";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const MANAGER_ID = "222222222222222222";
const INTRUDER_ID = "333333333333333333";
const MOD_ROLE_ID = "444444444444444444";

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
  let guild: any;

  beforeEach(() => {
    vi.clearAllMocks();

    guild = {
      id: GUILD_ID,
      ownerId: OWNER_ID,
      name: "Test Guild",
      memberCount: 3,
      iconURL: vi.fn().mockReturnValue("https://example.com/icon.png"),
      bannerURL: vi.fn().mockReturnValue("https://example.com/banner.png"),
      roles: {
        cache: new Collection([
          [
            GUILD_ID,
            { id: GUILD_ID, name: "@everyone", color: 0, position: 0, permissions: { bitfield: 0n } },
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
          ["555555555555555555", { id: "555555555555555555", name: "general", type: 0 }],
          ["777777777777777777", { id: "777777777777777777", name: "thread", type: 11 }],
        ]),
      },
      members: {
        fetch: vi.fn(),
        me: { roles: { highest: { id: MOD_ROLE_ID } } },
        cache: new Collection(),
      },
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
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(call("guild.shell.get", INTRUDER_ID)).rejects.toThrow(
        "Missing ManageGuild permission",
      );
      expect(container.db.config.getGuildSettings).not.toHaveBeenCalled();
    });

    it("returns identity, settings and module manifests for the guild owner", async () => {
      const result = (await call("guild.shell.get", OWNER_ID)) as any;

      expect(result.name).toBe("Test Guild");
      expect(result.memberCount).toBe(3);
      expect(result.settings.prefix).toBe("!");
      expect(container.db.config.getGuildSettings).toHaveBeenCalledWith(GUILD_ID);
      expect(guild.members.fetch).not.toHaveBeenCalled();
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
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn((perm: string) => perm === "ManageGuild") },
      });

      const result = (await call("guild.shell.get", MANAGER_ID)) as any;

      expect(result.name).toBe("Test Guild");
      expect(guild.members.fetch).toHaveBeenCalledWith(MANAGER_ID);
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
          permissions: "8",
          isBotRole: true,
        },
      ]);
      expect(result.channels).toEqual([
        { id: "555555555555555555", name: "general", type: 0 },
      ]);
      expect(result.members).toEqual([]);
    });
  });

  describe("guild.summaries.list", () => {
    it("rejects a request with no actorId", async () => {
      await expect(
        call("guild.summaries.list", undefined, { guildIds: [GUILD_ID] }),
      ).rejects.toThrow("actorId is required");
    });

    it("omits guilds the actor cannot manage instead of failing the batch", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      const result = (await call("guild.summaries.list", INTRUDER_ID, {
        guildIds: [GUILD_ID],
      })) as any;

      expect(result).toEqual({ summaries: [] });
    });
  });
});
