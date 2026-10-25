import { describe, expect, it } from "vitest";
import {
  pingCommand,
  handlePingButton,
  handlePingClose,
} from "../../apps/bot/src/core/src/commands.js";

const makeServices = () => ({
  client: {
    ws: {
      ping: 42,
      shards: new Map([
        [0, { ping: 41 }],
        [1, { ping: 55 }],
      ]),
    },
    guilds: { cache: new Map([["1", { memberCount: 5 }]]) },
    uptime: 3_600_000,
  },
  prisma: { $queryRaw: async () => [] },
});

const makeInteraction = () => {
  const cards: any[] = [];
  const interaction = {
    user: { id: "u1" },
    reply: async (card: any) => cards.push(card),
    update: async (card: any) => cards.push(card),
  };
  return { interaction, cards };
};

describe("ping panel", () => {
  it("renders shard pagination with parseable custom IDs", async () => {
    const { interaction, cards } = makeInteraction();
    await pingCommand.execute(interaction as any, makeServices() as any);

    expect(cards).toHaveLength(1);
    expect(cards[0].flags).toBe(32768);
    const json = JSON.stringify(cards[0]);
    expect(json).toContain("ping:p:-1:u1");
    expect(json).toContain("ping:p:1:u1");
    expect(json).toContain("ping:close:u1");
  });

  it("pages forward and back", async () => {
    const { interaction, cards } = makeInteraction();
    await pingCommand.execute(interaction as any, makeServices() as any);

    const forward = await handlePingButton(
      { ...interaction, customId: "ping:p:1:u1" } as any,
      makeServices() as any,
    );
    const back = await handlePingButton(
      { ...interaction, customId: "ping:p:-1:u1" } as any,
      makeServices() as any,
    );

    expect(forward).toBe(true);
    expect(back).toBe(true);
    expect(cards).toHaveLength(3);
  });

  it("closes the panel", async () => {
    const { interaction, cards } = makeInteraction();
    await pingCommand.execute(interaction as any, makeServices() as any);
    const closed = await handlePingClose(
      { ...interaction, customId: "ping:close:u1" } as any,
    );

    expect(closed).toBe(true);
    expect(cards).toHaveLength(2);
  });
});
