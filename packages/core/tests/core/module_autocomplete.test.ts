import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { ModuleCommand } from "#modules/core/commands/module.js";

vi.mock("#lib/module-system/Utility.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getUtility: vi.fn(),
  };
});

import { getUtility } from "#lib/module-system/Utility.js";

function makeInteraction(opts: {
  focusedName: string;
  focusedValue: string;
  subcommand?: string | null;
  strings?: Record<string, string | null>;
}) {
  const respond = vi.fn().mockResolvedValue(undefined);
  return {
    respond,
    options: {
      getFocused: vi.fn().mockReturnValue({
        name: opts.focusedName,
        value: opts.focusedValue,
        focused: true,
      }),
      getSubcommand: vi.fn().mockReturnValue(opts.subcommand ?? null),
      getString: vi
        .fn()
        .mockImplementation((name: string) => opts.strings?.[name] ?? null),
    },
  } as any;
}

describe("ModuleCommand.autocompleteRun", () => {
  let command: ModuleCommand;
  let mockModuleStore: any;
  let mockDownloaderUtility: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockModuleStore = {
      all: vi.fn().mockReturnValue([
        { name: "afk", enabled: true },
        { name: "mod", enabled: false },
        { name: "moderation-extras", enabled: false },
      ]),
    };

    mockDownloaderUtility = {
      listRepos: vi.fn().mockResolvedValue([
        { name: "official" },
        { name: "community" },
      ]),
      getInstalledModules: vi.fn().mockResolvedValue([
        { moduleName: "leveling", pinned: false },
        { moduleName: "economy", pinned: true },
      ]),
      getModulesInRepo: vi.fn().mockResolvedValue([
        { name: "leveling", hidden: false },
        { name: "starboard", hidden: false },
        { name: "hidden-mod", hidden: true },
      ]),
    };

    (getUtility as any).mockImplementation((name: string) =>
      name === "downloader" ? mockDownloaderUtility : null,
    );

    (container as any).moduleStore = mockModuleStore;
    (container as any).client = { options: {} } as any;

    command = new ModuleCommand(
      {
        name: "module",
        path: "/path/to/commands/module.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      },
      { prefixEnabled: true },
    );
  });

  it("suggests disabled modules for enable", async () => {
    const interaction = makeInteraction({
      focusedName: "module",
      focusedValue: "",
      subcommand: "enable",
    });
    await command.autocompleteRun(interaction);
    const [choices] = interaction.respond.mock.calls[0]!;
    expect(choices.map((c: any) => c.value)).toEqual(["mod", "moderation-extras"]);
  });

  it("suggests enabled modules for disable", async () => {
    const interaction = makeInteraction({
      focusedName: "module",
      focusedValue: "",
      subcommand: "disable",
    });
    await command.autocompleteRun(interaction);
    const [choices] = interaction.respond.mock.calls[0]!;
    expect(choices.map((c: any) => c.value)).toEqual(["afk"]);
  });

  it("suggests repo names for the repo option", async () => {
    const interaction = makeInteraction({
      focusedName: "repo",
      focusedValue: "comm",
      subcommand: "install",
    });
    await command.autocompleteRun(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: "community", value: "community" },
    ]);
  });

  it("suggests not-yet-installed modules from the chosen repo for install", async () => {
    const interaction = makeInteraction({
      focusedName: "module",
      focusedValue: "",
      subcommand: "install",
      strings: { repo: "official" },
    });
    await command.autocompleteRun(interaction);
    expect(mockDownloaderUtility.getModulesInRepo).toHaveBeenCalledWith("official");
    const [choices] = interaction.respond.mock.calls[0]!;
    expect(choices.map((c: any) => c.value)).toEqual(["starboard"]);
  });

  it("responds empty for install/module when no repo has been chosen yet", async () => {
    const interaction = makeInteraction({
      focusedName: "module",
      focusedValue: "",
      subcommand: "install",
    });
    await command.autocompleteRun(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it("suggests installed modules for uninstall", async () => {
    const interaction = makeInteraction({
      focusedName: "module",
      focusedValue: "",
      subcommand: "uninstall",
    });
    await command.autocompleteRun(interaction);
    const [choices] = interaction.respond.mock.calls[0]!;
    expect(choices.map((c: any) => c.value).sort()).toEqual(["economy", "leveling"]);
  });

  it("suggests only unpinned installed modules for pin", async () => {
    const interaction = makeInteraction({
      focusedName: "module",
      focusedValue: "",
      subcommand: "pin",
    });
    await command.autocompleteRun(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: "leveling", value: "leveling" },
    ]);
  });

  it("suggests only pinned installed modules for unpin", async () => {
    const interaction = makeInteraction({
      focusedName: "module",
      focusedValue: "",
      subcommand: "unpin",
    });
    await command.autocompleteRun(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: "economy", value: "economy" },
    ]);
  });
});
