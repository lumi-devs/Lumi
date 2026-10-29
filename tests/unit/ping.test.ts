import { describe, expect, it } from "vitest";
import {
  handlePingButton,
  pingCommand,
} from "../../src/core/commands.ts";

const makeServices = (
  options: {
    shardPings?: number[];
    guilds?: Array<{ memberCount: number; shardId?: number }>;
  } = {},
) => {
  const shardPings = options.shardPings ?? [41, 55];
  return {
    client: {
      ws: {
        ping: 42,
        shards: new Map(
          shardPings.map((ping, id) => [id, { ping }] as const),
        ),
      },
      guilds: {
        cache: new Map(
          (options.guilds ?? [{ memberCount: 5 }]).map(
            (guild, index) => [`${index}`, guild] as const,
          ),
        ),
      },
      uptime: 158_000,
      user: { username: "test" },
    },
    prisma: { $queryRaw: async () => [] },
  };
};

const makeInteraction = (userId = "u1") => {
  const cards: any[] = [];
  const interaction = {
    user: { id: userId },
    reply: async (card: any) => cards.push(card),
    update: async (card: any) => cards.push(card),
  };
  return { interaction, cards };
};

const containerOf = (card: any) =>
  JSON.parse(JSON.stringify(card.components[0]));

const displaysOf = (card: any): string[] =>
  containerOf(card).components
    .filter((component: any) => component.type === 10)
    .map((component: any) => component.content);

const buttonsOf = (card: any): any[] => {
  const actionRow = containerOf(card).components.find(
    (component: any) => component.type === 1,
  );
  return actionRow.components;
};

const shardHeaders = (card: any): string[] =>
  displaysOf(card)
    .filter((content) => content.startsWith("__🟢"))
    .map((content) => content.split("\n")[0]!);

describe("ping panel", () => {
  it("renders the target layout with no accent color", async () => {
    const { interaction, cards } = makeInteraction();
    await pingCommand.execute(interaction as any, makeServices() as any);

    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.flags).toBe(32768);
    expect(card).not.toHaveProperty("embeds");

    const container = containerOf(card);
    expect(container.type).toBe(17);
    expect(container.accent_color ?? null).toBeNull();
    expect(container.components.map((component: any) => component.type)).toEqual([
      10, 14, 10, 14, 10, 14, 10, 14, 1,
    ]);
    for (const separator of container.components.filter(
      (component: any) => component.type === 14,
    )) {
      expect(separator).toMatchObject({ spacing: 1, divider: true });
    }

    const displays = displaysOf(card);
    expect(displays[0]).toBe("__## test Status:__");

    expect(displays[1]!.split("\n")).toEqual([
      "__🟢 **Shard [0]:** __",
      "⠀📡 41ms · ⏱️ 2m 38s",
      expect.stringMatching(
        /^⠀\*\*CPU\*\*: \d+% \. 📊 \*\*RAM:\*\* \d+\.\d MB \. \*\*\(\d+\.\d{2}%\)\*\* {2}$/,
      ),
      "⠀📈 **Servers:** 1· 👥 **Members:** 5",
    ]);

    expect(displays[2]!.split("\n")).toEqual([
      "__🟢 **Shard [1]:** __",
      "⠀📡 55ms · ⏱️ 2m 38s",
      expect.stringMatching(
        /^⠀\*\*CPU\*\*: \d+% \. 📊 \*\*RAM:\*\* \d+\.\d MB \. \*\*\(\d+\.\d{2}%\)\*\* {2}$/,
      ),
      "⠀📈 **Servers:** 0· 👥 **Members:** 0",
    ]);

    expect(displays[3]).toMatch(
      /^### External Services:\n⠀🧠 \*\*Cache:\*\* \d+\.\d% hit ratio \n⠀ 🐘 \*\*Database:\*\* `\d+ms`$/,
    );
  });

  it("uses parseable custom IDs and disables both arrows for one page", async () => {
    const { interaction, cards } = makeInteraction();
    await pingCommand.execute(interaction as any, makeServices() as any);

    const buttons = buttonsOf(cards[0]);
    expect(buttons.map((button: any) => button.custom_id)).toEqual([
      "ping:p:-1:u1",
      "ping:p:1:u1",
    ]);
    expect(buttons[0]).toMatchObject({
      style: 2,
      disabled: true,
      emoji: { name: "◀️" },
    });
    expect(buttons[1]).toMatchObject({
      style: 2,
      disabled: true,
      emoji: { name: "▶️" },
    });
  });

  it("groups ten shards per page and pages forward and back", async () => {
    const services = makeServices({
      shardPings: Array.from({ length: 15 }, (_, id) => 40 + id),
    });
    const { interaction, cards } = makeInteraction("u2");
    await pingCommand.execute(interaction as any, services as any);

    expect(shardHeaders(cards[0]!)).toHaveLength(10);
    expect(shardHeaders(cards[0]!)[0]).toBe("__🟢 **Shard [0]:** __");
    expect(shardHeaders(cards[0]!)[9]).toBe("__🟢 **Shard [9]:** __");
    expect(buttonsOf(cards[0]!)[0]!.disabled).toBe(true);
    expect(buttonsOf(cards[0]!)[1]!.disabled).toBe(false);

    const forward = await handlePingButton(
      { ...interaction, customId: "ping:p:1:u2" } as any,
      services as any,
    );
    expect(forward).toBe(true);
    expect(shardHeaders(cards[1]!)).toHaveLength(5);
    expect(shardHeaders(cards[1]!)[0]).toBe("__🟢 **Shard [10]:** __");
    expect(shardHeaders(cards[1]!)[4]).toBe("__🟢 **Shard [14]:** __");
    expect(buttonsOf(cards[1]!)[0]!.disabled).toBe(false);
    expect(buttonsOf(cards[1]!)[1]!.disabled).toBe(true);

    const back = await handlePingButton(
      { ...interaction, customId: "ping:p:-1:u2" } as any,
      services as any,
    );
    expect(back).toBe(true);
    expect(shardHeaders(cards[2]!)).toHaveLength(10);
    expect(shardHeaders(cards[2]!)[0]).toBe("__🟢 **Shard [0]:** __");
  });

  it("blocks other users from paginating", async () => {
    const { interaction, cards } = makeInteraction("owner");
    await pingCommand.execute(interaction as any, makeServices() as any);

    const denied = await handlePingButton(
      {
        ...interaction,
        user: { id: "intruder" },
        customId: "ping:p:1:owner",
      } as any,
      makeServices() as any,
    );

    expect(denied).toBe(true);
    expect(cards).toHaveLength(2);
    expect(JSON.stringify(cards[1])).toContain("belongs to another user");
  });

});
