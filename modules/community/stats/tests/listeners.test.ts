import { describe, expect, it, vi } from "vitest";
import statsModule from "../index.ts";

describe("stats module listeners", () => {
  it("routes stats buttons to the stats interaction handler", async () => {
    const listener = statsModule.listeners.find(
      (entry) => entry.event === "interactionCreate",
    );
    expect(listener).toBeDefined();

    const reply = vi.fn(async () => undefined);
    const interaction = {
      isButton: () => true,
      customId: "stats:refresh:server:overview:7d:owner:0:1",
      guildId: "guild",
      guild: { id: "guild" },
      user: { id: "intruder" },
      reply,
    };

    await listener!.handler(interaction as never, {} as never);

    expect(reply).toHaveBeenCalledTimes(1);
  });
});
