import { SlashCommandBuilder } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/core/modules.ts";
import { handlePrefixMessage } from "../../src/core/prefix.ts";

const OriginalOwnerIds = process.env.OWNER_IDS;

afterEach(() => {
  if (OriginalOwnerIds === undefined) {
    delete process.env.OWNER_IDS;
  } else {
    process.env.OWNER_IDS = OriginalOwnerIds;
  }
});

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

function ownerCommand(execute: (interaction: unknown) => Promise<void>) {
  const registry = new CommandRegistry();
  registry.add({
    ownerOnly: true,
    module: null,
    data: new SlashCommandBuilder()
      .setName("owner")
      .setDescription("Bot owner operations"),
    execute,
  });
  return registry;
}

async function run(
  content: string,
  execute: (interaction: unknown) => Promise<void>,
) {
  const source = message(content);
  const registry = ownerCommand(execute);
  await handlePrefixMessage(source as never, {
    client: source.client as never,
    registry,
    moduleLoader: { isActive: () => true },
    services: {
      configService: { get: async () => "," },
      permits: {},
    } as never,
    logger: { error: vi.fn() },
  });
  return source;
}

describe("prefix owner-only gate", () => {
  it("blocks non-owners from running owner commands through the prefix", async () => {
    process.env.OWNER_IDS = "someone-else";
    const execute = vi.fn(async () => undefined);

    const source = await run(
      ",owner servers_leave --guild_id 123 --confirm true",
      execute,
    );

    expect(execute).not.toHaveBeenCalled();
    expect(source.reply).toHaveBeenCalledTimes(1);
  });

  it("allows configured bot owners to run owner commands through the prefix", async () => {
    process.env.OWNER_IDS = "user";
    const execute = vi.fn(async () => undefined);

    const source = await run(
      ",owner servers_leave --guild_id 123 --confirm true",
      execute,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(source.reply).not.toHaveBeenCalled();
  });
});
