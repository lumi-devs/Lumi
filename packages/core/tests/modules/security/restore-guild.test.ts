import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import { ChannelType } from "discord.js";
import { Routes } from "discord-api-types/v10";
import { restoreGuildFromBackup } from "@lumi/application/services/security/restore-guild.js";
import { repositoryCache } from "@lumi/lib/cache/cache-store.js";

const GUILD_ID = "111111111111111111";
const EVERYONE = { id: GUILD_ID, position: 0 };

function mockContainer(overrides: {
  getBackup?: ReturnType<typeof vi.fn>;
  getLatestBackup?: ReturnType<typeof vi.fn>;
  restPost?: ReturnType<typeof vi.fn>;
  restPatch?: ReturnType<typeof vi.fn>;
  roles?: { id: string; position: number }[];
  channels?: { id: string }[];
}) {
  const roles = overrides.roles ?? [EVERYONE];
  const channels = overrides.channels ?? [];

  (container as any).db = {
    security: {
      getBackup: overrides.getBackup ?? vi.fn(),
      getLatestBackup: overrides.getLatestBackup ?? vi.fn(),
    },
  };
  const restGet = vi.fn().mockImplementation((route: string) => {
    if (route === `/guilds/${GUILD_ID}/roles`) return Promise.resolve(roles);
    if (route === `/guilds/${GUILD_ID}/channels`) return Promise.resolve(channels);
    return Promise.reject(new Error(`Unexpected route: ${route}`));
  });
  (container as any).client = {
    rest: {
      get: restGet,
      post: overrides.restPost ?? vi.fn(),
      patch: overrides.restPatch ?? vi.fn(),
    },
  };
  (container as any).valkey = { get: vi.fn().mockResolvedValue(null), setex: vi.fn() };
  (container as any).logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryCache.clear();
});

describe("restoreGuildFromBackup", () => {
  it("returns null when no backup row matches the guild", async () => {
    mockContainer({ getLatestBackup: vi.fn().mockResolvedValue(null) });
    const result = await restoreGuildFromBackup(GUILD_ID, undefined);
    expect(result).toBeNull();
  });

  it("returns null when the backup belongs to a different guild", async () => {
    mockContainer({
      getLatestBackup: vi.fn().mockResolvedValue({
        guildId: "other-guild",
        data: { roles: [], channels: [] },
      }),
    });
    const result = await restoreGuildFromBackup(GUILD_ID, undefined);
    expect(result).toBeNull();
  });

  it("skips roles/channels already present via REST", async () => {
    const existingRoleId = "222222222222222222";
    const existingChannelId = "333333333333333333";
    const restPost = vi.fn();
    const restPatch = vi.fn();
    mockContainer({
      getLatestBackup: vi.fn().mockResolvedValue({
        guildId: GUILD_ID,
        data: {
          roles: [
            {
              id: existingRoleId,
              name: "Mods",
              color: 0,
              permissions: "0",
              position: 1,
              hoist: false,
              mentionable: false,
            },
          ],
          channels: [
            {
              id: existingChannelId,
              name: "general",
              type: ChannelType.GuildText,
              parentId: null,
              position: 0,
              overwrites: [],
            },
          ],
        },
      }),
      restPost,
      restPatch,
      roles: [EVERYONE, { id: existingRoleId, position: 1 }],
      channels: [{ id: existingChannelId }],
    });

    const result = await restoreGuildFromBackup(GUILD_ID, undefined);

    expect(result).toEqual({ rolesRestored: 0, channelsRestored: 0 });
    expect(restPost).not.toHaveBeenCalled();
    expect(restPatch).not.toHaveBeenCalled();
  });

  it("creates a missing role via REST, then reorders roles to match the snapshot position", async () => {
    const createdRoleId = "999999999999999999";
    const restPost = vi.fn().mockResolvedValue({ id: createdRoleId });
    const restPatch = vi.fn().mockResolvedValue(undefined);
    mockContainer({
      getBackup: vi.fn().mockResolvedValue({
        guildId: GUILD_ID,
        data: {
          roles: [
            {
              id: "old-role-id",
              name: "Mods",
              color: 123,
              permissions: "8",
              position: 1,
              hoist: true,
              mentionable: true,
            },
          ],
          channels: [],
        },
      }),
      restPost,
      restPatch,
      roles: [EVERYONE],
    });

    const result = await restoreGuildFromBackup(GUILD_ID, 42);

    expect(result).toEqual({ rolesRestored: 1, channelsRestored: 0 });
    expect(restPost).toHaveBeenCalledWith(Routes.guildRoles(GUILD_ID), {
      body: {
        name: "Mods",
        color: 123,
        permissions: "8",
        hoist: true,
        mentionable: true,
      },
      reason: "Security: restoring from backup",
    });
    expect(restPatch).toHaveBeenCalledWith(
      Routes.guildRoles(GUILD_ID),
      expect.objectContaining({
        body: [
          { id: GUILD_ID, position: 0 },
          { id: createdRoleId, position: 1 },
        ],
        reason: "Security: restoring from backup",
      }),
    );
  });

  it("does not count the role as restored if the reorder PATCH fails after a successful create", async () => {
    const createdRoleId = "999999999999999999";
    const restPost = vi.fn().mockResolvedValue({ id: createdRoleId });
    const restPatch = vi.fn().mockRejectedValue(new Error("reorder failed"));
    mockContainer({
      getLatestBackup: vi.fn().mockResolvedValue({
        guildId: GUILD_ID,
        data: {
          roles: [
            {
              id: "old-role-id",
              name: "Mods",
              color: 0,
              permissions: "0",
              position: 1,
              hoist: false,
              mentionable: false,
            },
          ],
          channels: [],
        },
      }),
      restPost,
      restPatch,
      roles: [EVERYONE],
    });

    const result = await restoreGuildFromBackup(GUILD_ID, undefined);

    expect(result).toEqual({ rolesRestored: 0, channelsRestored: 0 });
    expect(container.logger.warn).toHaveBeenCalled();
  });

  it("creates roles before channels, and remaps role ids in channel overwrites", async () => {
    const createdRoleId = "999999999999999999";
    const createdCategoryId = "888888888888888888";
    const restPost = vi
      .fn()
      .mockResolvedValueOnce({ id: createdRoleId })
      .mockResolvedValueOnce({ id: createdCategoryId })
      .mockResolvedValueOnce({ id: "777777777777777777" });
    const restPatch = vi.fn().mockResolvedValue(undefined);
    mockContainer({
      getLatestBackup: vi.fn().mockResolvedValue({
        guildId: GUILD_ID,
        data: {
          roles: [
            {
              id: "old-role-id",
              name: "Mods",
              color: 0,
              permissions: "0",
              position: 1,
              hoist: false,
              mentionable: false,
            },
          ],
          channels: [
            {
              id: "old-text-id",
              name: "chat",
              type: ChannelType.GuildText,
              parentId: "old-category-id",
              position: 1,
              overwrites: [{ id: "old-role-id", type: 0, allow: "1024", deny: "0" }],
            },
            {
              id: "old-category-id",
              name: "Category",
              type: ChannelType.GuildCategory,
              parentId: null,
              position: 0,
              overwrites: [],
            },
          ],
        },
      }),
      restPost,
      restPatch,
      roles: [EVERYONE],
    });

    const result = await restoreGuildFromBackup(GUILD_ID, undefined);

    expect(result).toEqual({ rolesRestored: 1, channelsRestored: 2 });
    expect(restPost).toHaveBeenNthCalledWith(1, Routes.guildRoles(GUILD_ID), expect.any(Object));
    expect(restPost).toHaveBeenNthCalledWith(
      2,
      Routes.guildChannels(GUILD_ID),
      expect.objectContaining({
        body: expect.objectContaining({ name: "Category", parent_id: null }),
      }),
    );
    expect(restPost).toHaveBeenNthCalledWith(
      3,
      Routes.guildChannels(GUILD_ID),
      expect.objectContaining({
        body: expect.objectContaining({
          name: "chat",
          parent_id: createdCategoryId,
          permission_overwrites: [{ id: createdRoleId, type: 0, allow: "1024", deny: "0" }],
        }),
      }),
    );
  });

  it("logs a warning and continues when a channel create fails", async () => {
    const restPost = vi.fn().mockRejectedValue(new Error("boom"));
    mockContainer({
      getLatestBackup: vi.fn().mockResolvedValue({
        guildId: GUILD_ID,
        data: {
          roles: [],
          channels: [
            {
              id: "old-text-id",
              name: "chat",
              type: ChannelType.GuildText,
              parentId: null,
              position: 0,
              overwrites: [],
            },
          ],
        },
      }),
      restPost,
      roles: [EVERYONE],
    });

    const result = await restoreGuildFromBackup(GUILD_ID, undefined);

    expect(result).toEqual({ rolesRestored: 0, channelsRestored: 0 });
    expect(container.logger.warn).toHaveBeenCalled();
  });
});
