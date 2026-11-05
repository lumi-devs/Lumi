import { describe, expect, it, vi } from "vitest";
import { handlePrefixMessage } from "../../src/core/prefix.ts";

function fakeMessage(content: string) {
  const guild = {
    id: "guild",
    ownerId: "owner",
    members: { cache: new Map() },
  };

  return {
    partial: false,
    author: { bot: false, id: "user" },
    guild,
    guildId: guild.id,
    member: {
      id: "user",
      permissions: { has: () => true },
      roles: { cache: new Map() },
    },
    client: { user: { id: "bot" } },
    channel: { id: "channel" },
    channelId: "channel",
    content,
    createdTimestamp: Date.now(),
    reply: vi.fn(async () => undefined),
    fetch: vi.fn(async () => null),
  };
}

describe("prefix synthetic interaction", () => {
  it("exposes the source message and prefix to commands", async () => {
    const message = fakeMessage(",quote hello");
    const received: Record<string, unknown> = {};
    const command = {
      data: {
        name: "quote",
        toJSON: () => ({
          name: "quote",
          options: [{ name: "message", type: 3 }],
        }),
      },
      execute: async (interaction: unknown) => {
        const value = interaction as {
          sourceMessage: unknown;
          prefix: unknown;
          options: { getString: (name: string) => string | null };
        };
        received.sourceMessage = value.sourceMessage;
        received.prefix = value.prefix;
        received.message = value.options.getString("message");
      },
    };
    const context = {
      client: message.client,
      registry: {
        get: (name: string) => (name === "quote" ? command : undefined),
      },
      moduleLoader: { isActive: () => true },
      services: {
        configService: { get: async () => "," },
        permits: {},
      },
      logger: { error: vi.fn() },
    };

    await handlePrefixMessage(message as never, context as never);

    expect(received.sourceMessage).toBe(message);
    expect(received.prefix).toBe(",");
    expect(received.message).toBe("hello");
  });
});
