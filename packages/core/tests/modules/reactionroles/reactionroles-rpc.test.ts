import { describe, it, expect, vi, beforeEach } from "bun:test";
import { reactionrolesRpcHandlers } from "#modules/reactionroles/rpc.js";
import { container } from "#lib/services.js";

vi.mock("#lib/rpc/discord-rest-lookup.js", () => ({
  checkGuildManagerRest: vi.fn().mockResolvedValue({ isManager: true }),
}));

const mockUtility = {
  listMenus: vi.fn(),
  getMenu: vi.fn(),
  createMenu: vi.fn(),
  updateMenu: vi.fn(),
  deleteMenu: vi.fn(),
  removeOption: vi.fn(),
  editOption: vi.fn(),
  addOption: vi.fn(),
};

vi.mock("#lib/module-system/Utility.js", () => ({
  getUtility: vi.fn().mockReturnValue(mockUtility),
}));

describe("ReactionRoles RPC Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container.logger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as any;
    (container as any).moduleStore = {
      get: () => ({ name: "reactionroles" }),
      loaded: () => [{ name: "reactionroles" }],
    };
  });

  it("guild.reactionroles.menus.list maps database menus to response format", async () => {
    const listHandler = reactionrolesRpcHandlers.get("guild.reactionroles.menus.list")!;
    mockUtility.listMenus.mockResolvedValueOnce([
      {
        id: "menu-1",
        title: "Roles Menu",
        description: "Pick a role",
        color: 0xff0000,
        mode: "toggle",
        exclusive: false,
        maxRoles: 3,
        channelId: "ch-1",
        messageIds: ["msg-1"],
        options: [{ id: "opt-1", label: "Gamer", roleId: "r-1" }],
        richContent: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);

    const res = (await listHandler({
      id: "1",
      action: "guild.reactionroles.menus.list",
      guildId: "111111111111111111",
      actorId: "222222222222222222",
    })) as any;

    expect(res.menus).toHaveLength(1);
    expect(res.menus[0].id).toBe("menu-1");
    expect(res.menus[0].title).toBe("Roles Menu");
    expect(res.menus[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("guild.reactionroles.menus.delete deletes menu by id", async () => {
    const deleteHandler = reactionrolesRpcHandlers.get("guild.reactionroles.menus.delete")!;
    mockUtility.deleteMenu.mockResolvedValueOnce(true);

    const res = (await deleteHandler({
      id: "2",
      action: "guild.reactionroles.menus.delete",
      guildId: "111111111111111111",
      actorId: "222222222222222222",
      data: { id: "menu-1" },
    })) as any;

    expect(res).toEqual({ success: true, id: "menu-1", deleted: true });
    expect(mockUtility.deleteMenu).toHaveBeenCalledWith(container, "111111111111111111", "menu-1");
  });
});
