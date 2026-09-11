import { describe, expect, it } from "bun:test";
import { ChannelType } from "discord.js";
import {
  resolveAnnounceChannel,
  runGlobalAnnounce,
  summarizeAnnounce,
} from "../../../src/modules/core/lib/global-announce.js";

interface FakeChannel {
  id: string;
  type: ChannelType;
  position: number;
  viewable: boolean;
  writable: boolean;
  isDMBased: () => boolean;
  isThread: () => boolean;
  isTextBased: () => boolean;
  permissionsFor: () => { has: () => boolean } | null;
}

function makeChannel(
  id: string,
  opts: { type?: ChannelType; position?: number; writable?: boolean } = {},
): FakeChannel {
  const writable = opts.writable ?? true;
  return {
    id,
    type: opts.type ?? ChannelType.GuildText,
    position: opts.position ?? 0,
    viewable: true,
    writable,
    isDMBased: () => false,
    isThread: () => false,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => writable }),
  };
}

function makeGuild(channels: FakeChannel[], systemId?: string): any {
  const cache = new Map(channels.map((c) => [c.id, c]));
  return {
    members: { me: { id: "bot" } },
    systemChannel: systemId ? (cache.get(systemId) ?? null) : null,
    channels: {
      cache: {
        get: (id: string) => cache.get(id),
        filter: (fn: (c: FakeChannel) => boolean) => ({
          sort: (cmp: (a: FakeChannel, b: FakeChannel) => number) => ({
            first: () => [...cache.values()].filter(fn).sort(cmp)[0],
          }),
        }),
      },
    },
  };
}

describe("resolveAnnounceChannel", () => {
  it("prefers the configured channel", () => {
    const guild = makeGuild([makeChannel("a"), makeChannel("b")], "a");
    expect(resolveAnnounceChannel(guild, "b")?.id).toBe("b");
  });

  it("falls back to the system channel when the configured one is unusable", () => {
    const guild = makeGuild(
      [makeChannel("a"), makeChannel("gone", { writable: false })],
      "a",
    );
    expect(resolveAnnounceChannel(guild, "gone")?.id).toBe("a");
  });

  it("picks the lowest-position writable channel without configuration", () => {
    const guild = makeGuild([
      makeChannel("late", { position: 5 }),
      makeChannel("early", { position: 1 }),
    ]);
    expect(resolveAnnounceChannel(guild)?.id).toBe("early");
  });

  it("skips voice channels and returns null when nothing is sendable", () => {
    const guild = makeGuild([
      makeChannel("voice", { type: ChannelType.GuildVoice }),
      makeChannel("locked", { writable: false }),
    ]);
    expect(resolveAnnounceChannel(guild)).toBeNull();
  });
});

describe("runGlobalAnnounce", () => {
  it("counts sent, failed, and skipped outcomes", async () => {
    const summary = await runGlobalAnnounce(
      [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      async (guild) => {
        if (guild.id === "a") return "sent";
        if (guild.id === "b") return "skipped";
        if (guild.id === "c") return "failed";
        throw new Error("boom");
      },
      { staggerMs: 0 },
    );
    expect(summary.sent).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.results).toHaveLength(4);
  });

  it("visits every guild exactly once", async () => {
    const seen: string[] = [];
    await runGlobalAnnounce([{ id: "a" }, { id: "b" }], async (guild) => {
      seen.push(guild.id);
      return "sent";
    }, { staggerMs: 0 });
    expect(seen.sort()).toEqual(["a", "b"]);
  });
});

describe("summarizeAnnounce", () => {
  it("tallies each outcome", () => {
    expect(
      summarizeAnnounce([
        { guildId: "a", outcome: "sent" },
        { guildId: "b", outcome: "failed" },
        { guildId: "c", outcome: "skipped" },
      ]),
    ).toEqual({
      sent: 1,
      failed: 1,
      skipped: 1,
      results: [
        { guildId: "a", outcome: "sent" },
        { guildId: "b", outcome: "failed" },
        { guildId: "c", outcome: "skipped" },
      ],
    });
  });
});
