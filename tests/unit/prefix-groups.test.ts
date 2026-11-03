import { SlashCommandBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/core/modules.ts";
import { handlePrefixMessage } from "../../src/core/prefix.ts";

function commandData() {
  return new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("Tickets")
    .addSubcommandGroup((group) =>
      group
        .setName("setup")
        .setDescription("Setup")
        .addSubcommand((command) =>
          command
            .setName("panel")
            .setDescription("Panel")
            .addStringOption((option) =>
              option.setName("channel").setDescription("Channel"),
            ),
        ),
    );
}

function message(content: string) {
  const guild = {
    id: "guild",
    ownerId: "owner",
    roles: { cache: new Map() },
    channels: { cache: new Map() },
  };
  return {
    partial: false,
    content,
    author: { id: "user", bot: false },
    guild,
    guildId: guild.id,
    member: { id: "user", permissions: { has: () => true } },
    channel: { id: "channel" },
    channelId: "channel",
    client: { user: { id: "bot" }, users: { cache: new Map() } },
    mentions: {
      users: new Map(),
      members: new Map(),
      roles: new Map(),
      channels: new Map(),
    },
    createdTimestamp: Date.now(),
    reply: vi.fn(async () => undefined),
  };
}

describe("prefix dispatch", () => {
  it("routes subcommand groups with their group and subcommand names", async () => {
    const execute = vi.fn(async (_interaction: unknown) => undefined);
    const registry = new CommandRegistry();
    registry.add({
      data: commandData(),
      execute,
      module: "community-tickets",
    });

    const source = message(",tickets setup panel #123456789012345678");
    await handlePrefixMessage(source as never, {
      client: source.client as never,
      registry,
      moduleLoader: { isActive: () => true },
      services: {
        config: { get: async () => "," },
        permits: {},
      } as never,
      logger: { error: vi.fn() },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const interaction = execute.mock.calls[0]?.[0] as {
      options: {
        getSubcommandGroup(): string | null;
        getSubcommand(): string | null;
        getString(name: string): string | null;
      };
    };
    expect(interaction.options.getSubcommandGroup()).toBe("setup");
    expect(interaction.options.getSubcommand()).toBe("panel");
    expect(interaction.options.getString("channel")).toBe(
      "#123456789012345678",
    );
  });
});
