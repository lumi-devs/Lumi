import { describe, expect, it } from "bun:test";
import { ActivityType as DiscordActivityType, MessageFlags as DiscordMessageFlags } from "discord.js";
import { ActivityType, MessageFlags } from "./constants.js";

function forwardEntries(record: Record<string, string | number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(record)) if (typeof v === "number") out[k] = v;
  return out;
}

describe("discord constants", () => {
  it("matches the installed discord.js exactly", () => {
    expect(forwardEntries(MessageFlags)).toEqual(forwardEntries(DiscordMessageFlags));
    expect(forwardEntries(ActivityType)).toEqual(forwardEntries(DiscordActivityType));
  });
});
