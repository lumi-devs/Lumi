import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { PermitCommand } from "#modules/core/commands/permit.js";

vi.mock("#lib/module-system/Utility.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getUtility: vi.fn(),
  };
});

import { getUtility } from "#lib/module-system/Utility.js";

function makeInteraction(opts: {
  guildId?: string | null;
  focusedName: string;
  focusedValue: string;
  subcommand?: string | null;
  strings?: Record<string, string | null>;
}) {
  const respond = vi.fn().mockResolvedValue(undefined);
  return {
    guildId: "guildId" in opts ? opts.guildId : "guild-1",
    respond,
    options: {
      getFocused: vi.fn().mockReturnValue({
        name: opts.focusedName,
        value: opts.focusedValue,
        focused: true,
      }),
      getSubcommand: vi.fn().mockReturnValue(opts.subcommand ?? null),
      getString: vi.fn().mockImplementation((name: string) => opts.strings?.[name] ?? null),
    },
    respondCalls: respond,
  } as any;
}

function makePermit(name: string, nodes: string[]) {
  return { id: 1, name, nodes, builtin: false, kind: "custom", assignments: [] } as any;
}

describe("PermitCommand.autocompleteRun", () => {
  let command: PermitCommand;
  let mockPermissions: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPermissions = {
      listPermits: vi.fn().mockResolvedValue([]),
      findPermitByName: vi.fn().mockResolvedValue(null),
    };
    (getUtility as any).mockImplementation((name: string) =>
      name === "permissions" ? mockPermissions : null,
    );
    (container as any).client = { options: {} } as any;

    command = new PermitCommand(
      {
        name: "permit",
        path: "/path/to/commands/permit.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      },
      { prefixEnabled: true },
    );
  });

  it("suggests known permit nodes for the node option", async () => {
    const interaction = makeInteraction({
      focusedName: "node",
      focusedValue: "adm",
      subcommand: "create",
    });
    await command.autocompleteRun(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: "admin.*", value: "admin.*" },
      { name: "admin.config", value: "admin.config" },
    ]);
  });

  it("is case-insensitive when filtering node choices", async () => {
    const interaction = makeInteraction({
      focusedName: "node",
      focusedValue: "MOD",
      subcommand: "create",
    });
    await command.autocompleteRun(interaction);
    const [choices] = interaction.respond.mock.calls[0]!;
    expect(choices.map((c: any) => c.value)).toEqual([
      "mod.*",
      "mod.appeals",
      "mod.lockdown",
      "mod.notes",
      "mod.softban",
      "mod.voicemute",
    ]);
  });

  it("suggests the target permit's own nodes for nodes remove", async () => {
    mockPermissions.findPermitByName.mockResolvedValue(
      makePermit("staff", ["mod.*", "mod.softban"]),
    );
    const interaction = makeInteraction({
      focusedName: "node",
      focusedValue: "",
      subcommand: "remove",
      strings: { name: "staff" },
    });
    await command.autocompleteRun(interaction);
    expect(mockPermissions.findPermitByName).toHaveBeenCalledWith("guild-1", "staff");
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: "mod.*", value: "mod.*" },
      { name: "mod.softban", value: "mod.softban" },
    ]);
  });

  it("suggests existing permit names for delete/assign/unassign/nodes", async () => {
    mockPermissions.listPermits.mockResolvedValue([
      makePermit("staff", []),
      makePermit("moderators", []),
      makePermit("admins", []),
    ]);
    const interaction = makeInteraction({
      focusedName: "name",
      focusedValue: "mod",
      subcommand: "delete",
    });
    await command.autocompleteRun(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: "moderators", value: "moderators" },
    ]);
  });

  it("does not suggest permit names for the create subcommand", async () => {
    const interaction = makeInteraction({
      focusedName: "name",
      focusedValue: "any",
      subcommand: "create",
    });
    await command.autocompleteRun(interaction);
    expect(mockPermissions.listPermits).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it("caps permit name suggestions at 25 choices", async () => {
    mockPermissions.listPermits.mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => makePermit(`permit-${i}`, [])),
    );
    const interaction = makeInteraction({
      focusedName: "name",
      focusedValue: "",
      subcommand: "assign",
    });
    await command.autocompleteRun(interaction);
    const [choices] = interaction.respond.mock.calls[0]!;
    expect(choices).toHaveLength(25);
  });

  it("responds with an empty list when there is no guild", async () => {
    const interaction = makeInteraction({
      guildId: null,
      focusedName: "node",
      focusedValue: "",
    });
    await command.autocompleteRun(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });
});
