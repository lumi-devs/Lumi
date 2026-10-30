import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  commandPayloadForGuild,
} from "../../src/core/modules.ts";

function command(name: string, module: string | null) {
  return {
    data: { name, toJSON: () => ({ name }) },
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

    expect(commandPayloadForGuild(registry, loader, "guild")).toEqual([
      { name: "ping" },
      { name: "rank" },
    ]);
  });

  it("includes every command for guilds with all modules active", () => {
    const registry = new CommandRegistry();
    registry.add(command("ping", null));
    registry.add(command("afk", "utility-afk"));
    const loader = { isActive: () => true };

    expect(commandPayloadForGuild(registry, loader, "guild")).toEqual([
      { name: "ping" },
      { name: "afk" },
    ]);
  });
});
