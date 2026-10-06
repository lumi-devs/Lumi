import { describe, it, expect, vi, mock, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";

mock.module("#lib/commands.js", () => ({
  fetchTyped: async () => (key: string, _opts?: unknown) => key,
}));

Object.assign(container, {
  valkey: { lrange: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
});

const { default: AfkMentionsHandler } = await import(
  "#modules/afk/interactions/buttons/mentions.js"
);
const { AfkMentionsId } = await import("#modules/afk/constants.js");

function makeInteraction(over: Record<string, unknown> = {}) {
  return {
    customId: AfkMentionsId.build({ userId: "111", page: "0" }),
    guildId: "g1",
    guild: { id: "g1" },
    user: { id: "111" },
    message: { flags: { has: () => false } },
    replied: false,
    deferred: false,
    deferReply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe("afk mentions button repro", () => {
  beforeEach(() => vi.clearAllMocks());

  it("round-trips the welcome-back button customId", () => {
    const h = Object.create(AfkMentionsHandler.prototype);
    const built = AfkMentionsId.build({ userId: "111", page: "0" });
    const res = h.parse({ customId: built });
    expect(res.isSome()).toBe(true);
  });

  it("handle() completes and calls editReply (non-ephemeral source)", async () => {
    (container.valkey as any).lrange.mockResolvedValue([
      JSON.stringify({
        authorId: "222",
        authorName: "bob",
        channelId: "333",
        messageId: "444",
        ts: Math.floor(Date.now() / 1000) - 60,
      }),
    ]);
    const h = Object.create(AfkMentionsHandler.prototype);
    const interaction = makeInteraction();
    await h.handle(interaction, { userId: "111", page: "0" });
    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const payload = interaction.editReply.mock.calls[0]![0] as any;
    // eslint-disable-next-line no-console
    console.log("EDIT PAYLOAD FLAGS:", payload.flags, "keys:", Object.keys(payload));
    expect(payload.flags & 32768).toBe(32768); // IsComponentsV2 kept
  });
});
