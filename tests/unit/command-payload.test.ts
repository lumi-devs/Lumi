import { SlashCommandBuilder } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  commandPayloadForGuild,
} from "../../src/core/modules.ts";

function command(name: string, module: string | null) {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription("test command"),
    execute: async () => {},
    module,
  };
}

describe("commandPayloadForGuild", () => {
  it("keeps built-in commands and removes disabled module commands", () => {
    const registry = new CommandRegistry();
    registry.add(command("ping", null));
    registry.add(command("afk", "utility-afk"));
    registry.add(command("rank", "community-leveling"));
    const loader = {
      isActive: (guildId: string, name: string) =>
        guildId !== "guild" || name !== "utility-afk",
    };

    expect(
      commandPayloadForGuild(registry, loader, "guild").map(
        (entry) => entry.name,
      ),
    ).toEqual(["ping", "rank"]);
  });

  it("excludes prefix-only commands from the slash payload", () => {
    const registry = new CommandRegistry();
    registry.add({
      ...command("autorole", "roles-autorole"),
      prefixOnly: true,
    });
    registry.add(command("bulkrole", "roles-bulkrole"));
    const loader = { isActive: () => true };

    expect(
      commandPayloadForGuild(registry, loader, "guild").map(
        (entry) => entry.name,
      ),
    ).toEqual(["bulkrole"]);
    expect(registry.payload().map((entry) => entry.name)).toEqual([
      "bulkrole",
    ]);
  });

  it("includes every command for guilds with all modules active", () => {
    const registry = new CommandRegistry();
    registry.add(command("ping", null));
    registry.add(command("afk", "utility-afk"));
    const loader = { isActive: () => true };

    expect(
      commandPayloadForGuild(registry, loader, "guild").map(
        (entry) => entry.name,
      ),
    ).toEqual(["ping", "afk"]);
  });
});
