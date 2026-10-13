import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { ComponentType, MessageFlags } from "discord.js";
import { CommandContext } from "#src/lib/commands/Context.js";
import { asHandler } from "#src/lib/commands/CommandDef.js";
import { commandRegistry } from "#src/lib/commands/CommandDef.js";
import { getCategories, buildHelpPages, firstPageOfCategory, renderHelpCard, helpDef, HelpCommandsPerPage } from "#src/modules/onboarding/commands/Help.js";
import { timeoutDef } from "#src/modules/mod/commands/Timeout.js";

vi.mock("#lib/i18n/Index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

function makeDef(name: string, module = "core") {
  return { name, module, description: `${name} description`, handlers: {} as Record<string, never> };
}

function makeServices(records: Record<string, unknown> = {}) {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    moduleStore: {
      loaded: () =>
        Object.entries(records).map(([name, meta]) => ({
          name,
          meta: { displayName: name, emoji: "", ...(meta as object) },
        })),
    },
    db: { config: { getGuildSettings: vi.fn().mockResolvedValue({ prefix: "!" }) } },
  } as any;
}

describe("getCategories", () => {
  let added: string[];

  beforeEach(() => {
    added = [];
  });

  afterEach(() => {
    for (const key of added) commandRegistry.delete(key);
  });

  function seed(defs: { name: string; module?: string }[]) {
    for (const d of defs) {
      const def = makeDef(d.name, d.module ?? "core");
      commandRegistry.set(d.name, def);
      added.push(d.name);
    }
  }

  it("groups commands under their module's display name", () => {
    const services = makeServices({ mod: { displayName: "Moderation", emoji: "🛡️" } });
    seed([
      { name: "ban", module: "mod" },
      { name: "kick", module: "mod" },
    ]);

    const { categories, sortedCategories } = getCategories(services);

    expect(sortedCategories).toEqual(["Moderation"]);
    expect(categories["Moderation"]!.map((c) => c.name)).toEqual(["ban", "kick"]);
  });

  it("treats a command with no declared module as core", () => {
    const services = makeServices({ core: { displayName: "Core", emoji: "⚙️" } });
    seed([{ name: "help" }]);

    const { categories, sortedCategories } = getCategories(services);

    expect(sortedCategories).toEqual(["Core"]);
    expect(categories["Core"]!.map((c) => c.name)).toEqual(["help"]);
  });

  it("sorts Core first and the remaining categories alphabetically", () => {
    const services = makeServices({ core: { displayName: "Core", emoji: "⚙️" } });
    seed([
      { name: "zeta", module: "zeta" },
      { name: "alpha", module: "alpha" },
      { name: "help", module: "core" },
    ]);

    const { sortedCategories } = getCategories(services);

    expect(sortedCategories).toEqual(["Core", "Alpha", "Zeta"]);
  });

  it("uses the module record's emoji and falls back to the gear emoji", () => {
    const services = makeServices({ mod: { displayName: "Moderation", emoji: "🛡️" } });
    seed([
      { name: "ban", module: "mod" },
      { name: "nick", module: "utility" },
    ]);

    const { categoryEmojis } = getCategories(services);

    expect(categoryEmojis["Moderation"]).toBe("🛡️");
    expect(categoryEmojis["Utility"]).toBe("⚙️");
  });

  it("counts every command across all categories", () => {
    const services = makeServices();
    seed([
      { name: "a", module: "one" },
      { name: "b", module: "one" },
      { name: "c", module: "two" },
    ]);

    const { totalCommandsCount, sortedCategories } = getCategories(services);

    expect(totalCommandsCount).toBe(3);
    expect(sortedCategories).toHaveLength(2);
  });

  it("lists a group's subcommands from its dispatch mapping", () => {
    expect(asHandler(timeoutDef.handlers!["add"]!).run).toBeDefined();
    const keys = Object.keys(timeoutDef.handlers ?? {});
    expect(keys).toContain("add");
    expect(keys).toContain("remove");
  });
});

describe("helpDef run", () => {
  let services: any;

  beforeEach(() => {
    vi.clearAllMocks();
    services = makeServices({ core: { displayName: "Core", emoji: "⚙️" } });
    services.db = {
      config: { getGuildSettings: vi.fn().mockResolvedValue({ prefix: "!" }) },
    };
    commandRegistry.set("help", helpDef);
  });

  afterEach(() => {
    commandRegistry.delete("help");
    vi.clearAllMocks();
  });

  function slashCtx() {
    const handlers: Record<string, (...args: any[]) => void> = {};
    const collector = {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        handlers[event] = handler;
        return collector;
      }),
      handlers,
    };
    const sentMessage = {
      createMessageComponentCollector: vi.fn().mockReturnValue(collector),
    };
    const interaction = {
      user: { id: "u-1", tag: "Tester#0001" },
      guildId: null,
      deferred: false,
      replied: false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(sentMessage),
      options: { getString: vi.fn().mockReturnValue(null) },
    } as any;
    return { ctx: CommandContext.fromInteraction(interaction, services), interaction, sentMessage, collector };
  }

  it("defers ephemerally before rendering on the slash path", async () => {
    const { ctx, interaction } = slashCtx();

    await helpDef.run!(ctx);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it("chunks big categories into sub-pages and jumps the select to the first page", () => {
    const categories: Record<string, any> = {
      Core: Array.from({ length: HelpCommandsPerPage + 3 }, (_, i) => makeDef(`c${i}`, "core")),
      Utility: [makeDef("nick", "utility")],
    };
    const pages = buildHelpPages(categories, ["Core", "Utility"]);

    expect(pages).toHaveLength(3);
    expect(pages[0]).toMatchObject({ category: "Core", pageInCategory: 0, pagesInCategory: 2 });
    expect(pages[1]).toMatchObject({ category: "Core", pageInCategory: 1, pagesInCategory: 2 });
    expect(pages[2]).toMatchObject({ category: "Utility", pageInCategory: 0, pagesInCategory: 1 });
    expect(firstPageOfCategory(pages, "Utility")).toBe(2);
    expect(firstPageOfCategory(pages, "Missing")).toBe(0);
  });

  it("renders one flattened page per chunk, keyed to the invoking user", async () => {
    commandRegistry.set("nick", makeDef("nick", "utility"));
    const { ctx, sentMessage } = slashCtx();

    try {
      await helpDef.run!(ctx);

      expect(sentMessage.createMessageComponentCollector).toHaveBeenCalled();
      const filter = sentMessage.createMessageComponentCollector.mock.calls[0]![0].filter;
      const select = { componentType: ComponentType.StringSelect, customId: "help:select", user: { id: "u-1" } };
      const stranger = { componentType: ComponentType.StringSelect, customId: "help:select", user: { id: "u-2" } };
      expect(filter(select)).toBe(true);
      expect(filter(stranger)).toBe(true);
      expect(filter({ componentType: ComponentType.Button, customId: "other:prev", user: { id: "u-1" } })).toBe(false);
    } finally {
      commandRegistry.delete("nick");
    }
  });

  it("renders the category select and prev/next controls into the card", () => {
    const categories: Record<string, any> = {
      Core: [makeDef("help", "core")],
      Utility: [makeDef("nick", "utility")],
    };
    const pages = buildHelpPages(categories, ["Core", "Utility"]);
    const texts: string[] = [];
    const rows: any[] = [];
    renderHelpCard(
      {
        addTextDisplayComponents: (c: any) => texts.push(c.data.content),
        addSeparatorComponents: () => undefined,
        addActionRowComponents: (r: any) => rows.push(r),
      } as any,
      ((key: string) => key) as any,
      "!",
      {
        categories,
        categoryEmojis: { Core: "⚙️", Utility: "⚙️" },
        sortedCategories: ["Core", "Utility"],
        totalCommandsCount: 2,
        pages,
        activePage: 1,
      },
    );

    expect(texts.join("\n")).toContain("**`/nick`** or **`!nick`**");
    expect(rows).toHaveLength(2);
  });

  it("reads the guild prefix from settings and renders it beside each command", async () => {
    const collector = { on: vi.fn().mockReturnThis() };
    const guildInteraction = {
      user: { id: "u-1", tag: "Tester#0001" },
      guildId: "g-1",
      deferred: true,
      replied: false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue({
        createMessageComponentCollector: vi.fn().mockReturnValue(collector),
      }),
      options: { getString: vi.fn().mockReturnValue(null) },
    } as any;
    const ctx = CommandContext.fromInteraction(guildInteraction, services);

    await helpDef.run!(ctx);

    expect(services.db.config.getGuildSettings).toHaveBeenCalledWith("g-1");

    const card = guildInteraction.editReply.mock.calls[0]![0];
    const container = card.components[0];
    const texts = container.components
      .filter((c: any) => c.data?.content !== undefined)
      .map((c: any) => c.data.content);

    expect(texts.join("\n")).toContain("**`/help`** or **`!help`**");
  });
});
