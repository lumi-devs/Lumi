import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { Collection } from "discord.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const MANAGER_ID = "222222222222222222";
const INTRUDER_ID = "333333333333333333";

describe("dashboard module RPC handlers", () => {
  let guild: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    guild = {
      id: GUILD_ID,
      ownerId: OWNER_ID,
      name: "Test Guild",
      iconURL: vi.fn().mockReturnValue("https://example.com/icon.png"),
      roles: {
        cache: new Collection([
          [
            GUILD_ID,
            { id: GUILD_ID, name: "@everyone", color: 0, position: 0, permissions: { bitfield: 0n } },
          ],
          [
            "444444444444444444",
            {
              id: "444444444444444444",
              name: "Mods",
              color: 0,
              position: 1,
              permissions: { bitfield: 0n },
            },
          ],
        ]),
      },
      channels: {
        cache: new Collection([
          ["555555555555555555", { id: "555555555555555555", name: "general", type: 0 }],
        ]),
      },
      members: {
        fetch: vi.fn(),
        me: { roles: { highest: { id: "444444444444444444" } } },
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
      guilds: {
        cache: new Map([[GUILD_ID, guild]]),
      },
    } as any;

    (container as any).db = {
      config: {
        getGuildSettings: vi.fn().mockResolvedValue({
          prefix: "!",
          muteRoleId: null,
        }),
        getAllModuleConfigsForGuild: vi.fn().mockResolvedValue(new Map()),
      },
      modules: {
        areModulesEnabled: vi.fn().mockResolvedValue(new Map()),
      },
    } as any;

    container.stores = {
      get: vi.fn().mockReturnValue({ loaded: () => [] }),
    } as any;

    const mod = new DashboardModule({} as any, { name: "dashboard" });
    await mod.onLoad();
  });

  const getHandler = () => {
    const handler = rpcHandlers.get(RPC_ACTIONS.guildDashboardGet);
    if (!handler) throw new Error("guildDashboardGet handler not registered");
    return handler;
  };

  it("rejects an actor who is neither the guild owner nor has ManageGuild/Administrator", async () => {
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

    const handler = getHandler();

    await expect(
      handler({
        id: "req-1",
        action: RPC_ACTIONS.guildDashboardGet,
        guildId: GUILD_ID,
        actorId: INTRUDER_ID,
      }),
    ).rejects.toThrow("Missing ManageGuild permission");

    expect(container.db.config.getGuildSettings).not.toHaveBeenCalled();
  });

  it("returns guild settings + modules for the guild owner", async () => {
    const handler = getHandler();

    const result = (await handler({
      id: "req-2",
      action: RPC_ACTIONS.guildDashboardGet,
      guildId: GUILD_ID,
      actorId: OWNER_ID,
    })) as any;

    expect(result.name).toBe("Test Guild");
    expect(result.settings.prefix).toBe("!");
    expect(container.db.config.getGuildSettings).toHaveBeenCalledWith(GUILD_ID);
    expect(guild.members.fetch).not.toHaveBeenCalled();
    expect(result.roles).toEqual([
      {
        id: "444444444444444444",
        name: "Mods",
        color: 0,
        position: 1,
        permissions: "0",
        isBotRole: true,
      },
    ]);
    expect(result.channels).toEqual([
      { id: "555555555555555555", name: "general", type: 0 },
    ]);
  });

  it("returns guild settings + modules for a non-owner actor with ManageGuild permission", async () => {
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn((perm: string) => perm === "ManageGuild") },
    });

    const handler = getHandler();

    const result = (await handler({
      id: "req-3",
      action: RPC_ACTIONS.guildDashboardGet,
      guildId: GUILD_ID,
      actorId: MANAGER_ID,
    })) as any;

    expect(result.name).toBe("Test Guild");
    expect(guild.members.fetch).toHaveBeenCalledWith(MANAGER_ID);
    expect(container.db.config.getGuildSettings).toHaveBeenCalledWith(GUILD_ID);
  });
});
