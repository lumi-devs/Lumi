import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { MessageFlags } from "discord.js";
import { CommandContext } from "#lib/command-context.js";
import { asHandler } from "#lib/commands/command-def.js";
import { commandRegistry } from "#lib/commands/command-def.js";
import { getCategories, helpDef } from "#modules/core/commands/help.js";
import { timeoutDef } from "#modules/mod/commands/timeout.js";
import { Emojis } from "#lib/utilities/assets.js";

vi.mock("#lib/utilities/pagination.js", () => ({
  paginateContainer: vi.fn().mockResolvedValue(undefined),
  paginateList: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#lib/i18n/index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

import { paginateContainer } from "#lib/utilities/pagination.js";

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
    expect(categoryEmojis["Utility"]).toBe(Emojis.Gear);
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
    const interaction = {
      user: { id: "u-1", tag: "Tester#0001" },
      guildId: null,
      deferred: false,
      replied: false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      options: { getString: vi.fn().mockReturnValue(null) },
    } as any;
    return { ctx: CommandContext.fromInteraction(interaction, services), interaction };
  }

  it("defers ephemerally before rendering on the slash path", async () => {
    const { ctx, interaction } = slashCtx();

    await helpDef.run!(ctx);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(paginateContainer).toHaveBeenCalled();
  });

  it("paginates over one page per category, keyed to the invoking user", async () => {
    commandRegistry.set("nick", makeDef("nick", "utility"));
    const { ctx } = slashCtx();

    try {
      await helpDef.run!(ctx);

      const opts = (paginateContainer as any).mock.calls[0][0];
      expect(opts.totalPages).toBe(2);
      expect(opts.userId).toBe("u-1");
      expect(opts.customIdPrefix).toBe("help");
    } finally {
      commandRegistry.delete("nick");
    }
  });

  it("reads the guild prefix from settings and renders it beside each command", async () => {
    const guildInteraction = {
      user: { id: "u-1", tag: "Tester#0001" },
      guildId: "g-1",
      deferred: true,
      replied: false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      options: { getString: vi.fn().mockReturnValue(null) },
    } as any;
    const ctx = CommandContext.fromInteraction(guildInteraction, services);

    await helpDef.run!(ctx);

    expect(services.db.config.getGuildSettings).toHaveBeenCalledWith("g-1");

    const opts = (paginateContainer as any).mock.calls[0][0];
    const texts: string[] = [];
    opts.render(0, {
      addTextDisplayComponents: (c: any) => texts.push(c.data.content),
      addSeparatorComponents: () => undefined,
    });

    expect(texts.join("\n")).toContain("**`/help`** or **`!help`**");
  });
});
