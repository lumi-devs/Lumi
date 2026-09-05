import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { getCategories, HelpCommand } from "#modules/core/commands/help.js";
import { Emojis } from "#lib/utilities/assets.js";

vi.mock("#lib/utilities/pagination.js", () => ({
  paginateContainer: vi.fn().mockResolvedValue(undefined),
  paginateList: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sapphire/plugin-i18next", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
}));

import { paginateContainer } from "#lib/utilities/pagination.js";

function makeCommand(
  name: string,
  options: Record<string, unknown> = {},
  description = `${name} description`,
) {
  return { name, description, options };
}

function setCommands(commands: unknown[]) {
  container.stores = {
    get: vi.fn().mockReturnValue({ values: () => commands }),
  } as any;
}

function setModuleRecords(records: Record<string, unknown>) {
  (container as any).moduleStore = {
    getRecord: vi.fn().mockImplementation((name: string) => records[name] ?? null),
  };
}

describe("getCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setModuleRecords({});
  });

  it("groups commands under their module's display name", () => {
    setModuleRecords({
      mod: { meta: { displayName: "Moderation", emoji: "🛡️" } },
    });
    setCommands([
      makeCommand("ban", { module: "mod" }),
      makeCommand("kick", { module: "mod" }),
    ]);

    const { categories, sortedCategories } = getCategories(container);

    expect(sortedCategories).toEqual(["Moderation"]);
    expect(categories["Moderation"]!.map((c) => c.name)).toEqual(["ban", "kick"]);
  });

  it("title-cases the raw module name when no module record exists", () => {
    setCommands([makeCommand("nick", { module: "utility" })]);

    const { sortedCategories } = getCategories(container);

    expect(sortedCategories).toEqual(["Utility"]);
  });

  it("treats a command with no declared module as core", () => {
    setModuleRecords({ core: { meta: { displayName: "Core", emoji: "⚙️" } } });
    setCommands([makeCommand("help")]);

    const { categories, sortedCategories } = getCategories(container);

    expect(sortedCategories).toEqual(["Core"]);
    expect(categories["Core"]!.map((c) => c.name)).toEqual(["help"]);
  });

  it("omits hidden commands from both the listing and the total", () => {
    setCommands([
      makeCommand("visible", { module: "utility" }),
      makeCommand("secret", { module: "utility", hidden: true }),
    ]);

    const { categories, totalCommandsCount } = getCategories(container);

    expect(categories["Utility"]!.map((c) => c.name)).toEqual(["visible"]);
    expect(totalCommandsCount).toBe(1);
  });

  it("sorts Core first and the remaining categories alphabetically", () => {
    setModuleRecords({ core: { meta: { displayName: "Core", emoji: "⚙️" } } });
    setCommands([
      makeCommand("zeta", { module: "zeta" }),
      makeCommand("alpha", { module: "alpha" }),
      makeCommand("help", { module: "core" }),
      makeCommand("mid", { module: "mid" }),
    ]);

    const { sortedCategories } = getCategories(container);

    expect(sortedCategories).toEqual(["Core", "Alpha", "Mid", "Zeta"]);
  });

  it("uses the module record's emoji and falls back to the gear emoji", () => {
    setModuleRecords({
      mod: { meta: { displayName: "Moderation", emoji: "🛡️" } },
    });
    setCommands([
      makeCommand("ban", { module: "mod" }),
      makeCommand("nick", { module: "utility" }),
    ]);

    const { categoryEmojis } = getCategories(container);

    expect(categoryEmojis["Moderation"]).toBe("🛡️");
    expect(categoryEmojis["Utility"]).toBe(Emojis.GEAR);
  });

  it("counts every non-hidden command across all categories", () => {
    setCommands([
      makeCommand("a", { module: "one" }),
      makeCommand("b", { module: "one" }),
      makeCommand("c", { module: "two" }),
    ]);

    const { totalCommandsCount, sortedCategories } = getCategories(container);

    expect(totalCommandsCount).toBe(3);
    expect(sortedCategories).toHaveLength(2);
  });

  it("returns empty results when no commands are loaded", () => {
    setCommands([]);

    const { categories, sortedCategories, totalCommandsCount } =
      getCategories(container);

    expect(categories).toEqual({});
    expect(sortedCategories).toEqual([]);
    expect(totalCommandsCount).toBe(0);
  });
});

describe("HelpCommand", () => {
  let command: HelpCommand;

  beforeEach(() => {
    vi.clearAllMocks();

    setModuleRecords({ core: { meta: { displayName: "Core", emoji: "⚙️" } } });
    setCommands([makeCommand("help", { module: "core" })]);

    (container as any).db = {
      config: {
        getGuildSettings: vi.fn().mockResolvedValue({ prefix: "!" }),
      },
    };
    (container as any).client = { options: {} };

    command = new HelpCommand(
      {
        name: "help",
        path: "/path/to/commands/help.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      },
      {},
    );
  });

  it("defers ephemerally before rendering on the slash path", async () => {
    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      guildId: null,
      user: { id: "u-1" },
    } as any;

    await command.chatInputRun(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(paginateContainer).toHaveBeenCalled();
  });

  it("paginates over one page per category, keyed to the invoking user", async () => {
    setCommands([
      makeCommand("help", { module: "core" }),
      makeCommand("nick", { module: "utility" }),
    ]);
    const message = { guildId: null, author: { id: "author-9" } } as any;

    await command.messageRun(message);

    const opts = (paginateContainer as any).mock.calls[0][0];
    expect(opts.totalPages).toBe(2);
    expect(opts.userId).toBe("author-9");
    expect(opts.customIdPrefix).toBe("help");
  });

  it("reads the guild prefix from settings and renders it beside each command", async () => {
    const message = { guildId: "g-1", author: { id: "u-1" } } as any;

    await command.messageRun(message);

    expect(container.db.config.getGuildSettings).toHaveBeenCalledWith("g-1");

    const opts = (paginateContainer as any).mock.calls[0][0];
    const texts: string[] = [];
    opts.render(0, {
      addTextDisplayComponents: (c: any) => texts.push(c.data.content),
      addSeparatorComponents: () => undefined,
    });

    expect(texts.join("\n")).toContain("**`/help`** or **`!help`**");
  });

  it("falls back to the default comma prefix outside a guild", async () => {
    const message = { guildId: null, author: { id: "u-1" } } as any;

    await command.messageRun(message);

    expect(container.db.config.getGuildSettings).not.toHaveBeenCalled();

    const opts = (paginateContainer as any).mock.calls[0][0];
    const texts: string[] = [];
    opts.render(0, {
      addTextDisplayComponents: (c: any) => texts.push(c.data.content),
      addSeparatorComponents: () => undefined,
    });

    expect(texts.join("\n")).toContain("**`,help`**");
  });

  it("falls back to the default prefix when the guild has none configured", async () => {
    (container.db.config.getGuildSettings as any).mockResolvedValue({
      prefix: null,
    });
    const message = { guildId: "g-1", author: { id: "u-1" } } as any;

    await command.messageRun(message);

    const opts = (paginateContainer as any).mock.calls[0][0];
    const texts: string[] = [];
    opts.render(0, {
      addTextDisplayComponents: (c: any) => texts.push(c.data.content),
      addSeparatorComponents: () => undefined,
    });

    expect(texts.join("\n")).toContain("**`,help`**");
  });
});
