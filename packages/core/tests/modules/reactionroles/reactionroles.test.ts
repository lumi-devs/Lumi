import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import {
  countMenus,
  deleteMenu,
  findMenuByMessage,
  getMenu,
  listMenus,
  normalizeMenuId,
  planToggle,
  resolveMenuId,
  saveMenu,
  toggleBlockedMessage,
  trackMenuMessage,
  validateMenuDraft,
  validateOptionDraft,
  type ReactionRoleMenu,
} from "#modules/reactionroles/data.js";

function makeMenu(overrides: Partial<ReactionRoleMenu> = {}): ReactionRoleMenu {
  const now = Date.now();
  return {
    id: "game-night",
    guildId: "guild-1",
    title: "Game Night",
    description: "Pick your squad.",
    color: "#5865F2",
    mode: "buttons",
    exclusive: false,
    maxRoles: 2,
    channelId: null,
    messageIds: [],
    options: [
      {
        id: "valorant",
        label: "Valorant",
        emoji: "🔫",
        description: null,
        roleId: "111111111111111111",
        requiredRoleId: null,
      },
      {
        id: "minecraft",
        label: "Minecraft",
        emoji: "⛏️",
        description: null,
        roleId: "222222222222222222",
        requiredRoleId: null,
      },
      {
        id: "vip-lounge",
        label: "VIP Lounge",
        emoji: "👑",
        description: null,
        roleId: "333333333333333333",
        requiredRoleId: "444444444444444444",
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function installMemoryKv() {
  const rows = new Map<string, unknown>();
  const keyOf = (guildId: string, module: string, targetId: string, key: string) =>
    `${guildId}:${module}:${targetId}:${key}`;
  (container as any).db = {
    ensureGuild: vi.fn().mockResolvedValue(undefined),
    guildKV: {
      getModuleData: vi.fn(async (guildId: string, module: string, targetId: string, key: string) => {
        return rows.get(keyOf(guildId, module, targetId, key)) ?? null;
      }),
      setModuleData: vi.fn(
        async (guildId: string, module: string, targetId: string, key: string, value: unknown) => {
          rows.set(keyOf(guildId, module, targetId, key), value);
        },
      ),
      deleteModuleData: vi.fn(
        async (guildId: string, module: string, targetId: string, key: string) => {
          return rows.delete(keyOf(guildId, module, targetId, key)) ? 1 : 0;
        },
      ),
      listModuleData: vi.fn(async (opts: { module: string; key: string; guildId?: string }) => {
        const out: { guildId: string; targetId: string; value: unknown }[] = [];
        for (const [k, value] of rows) {
          const [guildId, module, ...rest] = k.split(":");
          const key = rest.pop()!;
          const targetId = rest.join(":");
          if (module !== opts.module || key !== opts.key) continue;
          if (opts.guildId && guildId !== opts.guildId) continue;
          out.push({ guildId: guildId!, targetId, value });
        }
        return out;
      }),
    },
  } as any;
  return rows;
}

describe("reactionroles validation", () => {
  it("accepts a well-formed menu draft", () => {
    expect(
      validateMenuDraft({ title: "Game Night", mode: "buttons", maxRoles: 2 }),
    ).toEqual([]);
  });

  it("rejects blank titles, bad colors, bad modes, and out-of-range maxRoles", () => {
    expect(validateMenuDraft({ title: "  ", mode: "buttons" }).length).toBeGreaterThan(0);
    expect(
      validateMenuDraft({ title: "Ok", mode: "carrier-pigeon" }).some(
        (e) => e.field === "mode",
      ),
    ).toBe(true);
    expect(
      validateMenuDraft({ title: "Ok", mode: "buttons", color: "blurple" }).some(
        (e) => e.field === "color",
      ),
    ).toBe(true);
    expect(
      validateMenuDraft({ title: "Ok", mode: "buttons", maxRoles: 99 }).some(
        (e) => e.field === "maxRoles",
      ),
    ).toBe(true);
  });

  it("rejects bad option drafts and self-referential gates", () => {
    expect(
      validateOptionDraft({ label: "", roleId: "111111111111111111" }).some(
        (e) => e.field === "label",
      ),
    ).toBe(true);
    expect(
      validateOptionDraft({ label: "Ok", roleId: "not-a-snowflake" }).some(
        (e) => e.field === "roleId",
      ),
    ).toBe(true);
    expect(
      validateOptionDraft({
        label: "Ok",
        roleId: "111111111111111111",
        requiredRoleId: "111111111111111111",
      }).some((e) => e.field === "requiredRoleId"),
    ).toBe(true);
  });

  it("normalizes titles into slug ids", () => {
    expect(normalizeMenuId("Game Night!!")).toBe("game-night");
    expect(normalizeMenuId("!!!")).toBe("roles");
  });
});

describe("reactionroles planToggle", () => {
  it("toggles off a role the member already holds", () => {
    const plan = planToggle({
      menu: makeMenu(),
      optionId: "valorant",
      memberRoleIds: ["111111111111111111"],
    });
    expect(plan).toEqual({ outcome: "remove", roleId: "111111111111111111" });
  });

  it("adds a role when under the max", () => {
    const plan = planToggle({
      menu: makeMenu(),
      optionId: "minecraft",
      memberRoleIds: ["111111111111111111"],
    });
    expect(plan).toEqual({
      outcome: "add",
      roleId: "222222222222222222",
      removeRoleIds: [],
    });
  });

  it("blocks adds past maxRoles", () => {
    const menu = makeMenu({ maxRoles: 1 });
    const plan = planToggle({
      menu,
      optionId: "minecraft",
      memberRoleIds: ["111111111111111111"],
    });
    expect(plan.outcome).toBe("blocked");
    expect((plan as { reason: string }).reason).toBe("maxRolesReached");
    expect(toggleBlockedMessage(menu, plan as never)).toContain("1 role");
  });

  it("swaps other menu roles when exclusive", () => {
    const menu = makeMenu({ exclusive: true, maxRoles: 1 });
    const plan = planToggle({
      menu,
      optionId: "minecraft",
      memberRoleIds: ["111111111111111111", "999999999999999999"],
    });
    expect(plan).toEqual({
      outcome: "add",
      roleId: "222222222222222222",
      removeRoleIds: ["111111111111111111"],
    });
  });

  it("blocks gated options without the required role", () => {
    const menu = makeMenu();
    const blocked = planToggle({
      menu,
      optionId: "vip-lounge",
      memberRoleIds: [],
    });
    expect(blocked.outcome).toBe("blocked");
    expect((blocked as { reason: string }).reason).toBe("missingRequiredRole");
    expect(toggleBlockedMessage(menu, blocked as never)).toContain("444444444444444444");
  });

  it("allows gated options with the required role", () => {
    const plan = planToggle({
      menu: makeMenu(),
      optionId: "vip-lounge",
      memberRoleIds: ["444444444444444444"],
    });
    expect(plan.outcome).toBe("add");
  });

  it("blocks unknown options", () => {
    const menu = makeMenu();
    const plan = planToggle({ menu, optionId: "nope", memberRoleIds: [] });
    expect(plan.outcome).toBe("blocked");
    expect(toggleBlockedMessage(menu, plan as never)).toContain("no longer exists");
  });
});

describe("reactionroles menu CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryKv();
    container.logger = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    } as any;
  });

  it("saves, lists, and fetches menus per guild", async () => {
    await saveMenu(makeMenu());
    await saveMenu(makeMenu({ id: "other", guildId: "guild-2", title: "Other" }));

    expect(await countMenus("guild-1")).toBe(1);
    expect((await listMenus("guild-1")).map((m) => m.id)).toEqual(["game-night"]);
    expect((await getMenu("guild-1", "game-night"))?.title).toBe("Game Night");
    expect(await getMenu("guild-1", "missing")).toBeNull();
  });

  it("resolves unique menu ids", async () => {
    await saveMenu(makeMenu());
    expect(await resolveMenuId("guild-1", "Game Night")).toBe("game-night-2");
    expect(await resolveMenuId("guild-1", "Fresh Title")).toBe("fresh-title");
  });

  it("tracks posted messages and finds menus by message", async () => {
    const menu = await saveMenu(makeMenu());
    const tracked = await trackMenuMessage(menu, "channel-9", "message-7");
    expect(tracked.messageIds).toContain("message-7");

    const found = await findMenuByMessage("guild-1", "message-7");
    expect(found?.id).toBe("game-night");
    expect(await findMenuByMessage("guild-1", "unknown-message")).toBeNull();
  });

  it("deletes menus and their message refs", async () => {
    const menu = await saveMenu(makeMenu());
    await trackMenuMessage(menu, "channel-9", "message-7");
    expect(await deleteMenu("guild-1", "game-night")).toBe(true);
    expect(await deleteMenu("guild-1", "game-night")).toBe(false);
    expect(await countMenus("guild-1")).toBe(0);
  });
});
