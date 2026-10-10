import { describe, it, expect, vi, beforeEach } from "bun:test";
import { moduleDef } from "@lumi/modules/core/commands/module.js";

vi.mock("@lumi/lib/module-system/utility.js", () => ({
  getUtility: vi.fn(),
  tryGetUtility: vi.fn(),
}));

import { getUtility } from "@lumi/lib/module-system/utility.js";

function makeServices(records: any[] = []) {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    moduleStore: { all: vi.fn().mockReturnValue(records) },
  } as any;
}

function autocompleteInteraction(focusedName: string, subcommand: string | null, focusedValue = "") {
  return {
    user: { id: "owner-1" },
    respond: vi.fn().mockResolvedValue(undefined),
    options: {
      getFocused: vi.fn().mockReturnValue({ name: focusedName, value: focusedValue }),
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn().mockReturnValue(null),
    },
  } as any;
}

const records = [
  { name: "afk", enabled: true },
  { name: "mod", enabled: false },
];

describe("moduleDef autocomplete", () => {
  let downloader: any;
  let services: any;

  beforeEach(() => {
    vi.clearAllMocks();
    services = makeServices(records);
    downloader = {
      listRepos: vi.fn().mockResolvedValue([]),
      getModulesInRepo: vi.fn().mockResolvedValue([]),
      getInstalledModules: vi.fn().mockResolvedValue([]),
    };
    (getUtility as any).mockReturnValue(downloader);
  });

  it("suggests only disabled modules for enable", async () => {
    const interaction = autocompleteInteraction("module", "enable");

    await moduleDef.autocomplete!(services, interaction);

    expect(interaction.respond).toHaveBeenCalledWith([{ name: "mod", value: "mod" }]);
  });

  it("suggests only enabled modules for disable", async () => {
    const interaction = autocompleteInteraction("module", "disable");

    await moduleDef.autocomplete!(services, interaction);

    expect(interaction.respond).toHaveBeenCalledWith([{ name: "afk", value: "afk" }]);
  });

  it("filters suggestions by what the user typed", async () => {
    const interaction = autocompleteInteraction("module", "disable", "af");

    await moduleDef.autocomplete!(services, interaction);

    expect(interaction.respond).toHaveBeenCalledWith([{ name: "afk", value: "afk" }]);
  });

  it("suggests installed modules for uninstall", async () => {
    downloader.getInstalledModules.mockResolvedValue([{ moduleName: "economy" }]);
    const interaction = autocompleteInteraction("module", "uninstall");

    await moduleDef.autocomplete!(services, interaction);

    expect(interaction.respond).toHaveBeenCalledWith([{ name: "economy", value: "economy" }]);
    expect(downloader.getInstalledModules).toHaveBeenCalled();
  });

  it("suggests repo names for the repo option", async () => {
    downloader.listRepos.mockResolvedValue([{ name: "official" }, { name: "community" }]);
    const interaction = autocompleteInteraction("repo", "install");

    await moduleDef.autocomplete!(services, interaction);

    expect(interaction.respond).toHaveBeenCalledWith([
      { name: "official", value: "official" },
      { name: "community", value: "community" },
    ]);
  });
});
