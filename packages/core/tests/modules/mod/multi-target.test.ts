import { describe, it, expect, vi } from "bun:test";
import { container } from "@sapphire/framework";
import {
  MaxMassTargets,
  parseSnowflakeList,
  resolveMembers,
  resolveUsers,
} from "#lib/moderation/multi-target.js";

describe("parseSnowflakeList", () => {
  it("extracts raw IDs separated by spaces and commas", () => {
    expect(
      parseSnowflakeList("111111111111111111, 222222222222222222 333333333333333333"),
    ).toEqual([
      "111111111111111111",
      "222222222222222222",
      "333333333333333333",
    ]);
  });

  it("extracts IDs from user mentions", () => {
    expect(parseSnowflakeList("<@111111111111111111> <@!222222222222222222>")).toEqual([
      "111111111111111111",
      "222222222222222222",
    ]);
  });

  it("dedupes repeated IDs", () => {
    expect(parseSnowflakeList("111111111111111111 111111111111111111")).toEqual([
      "111111111111111111",
    ]);
  });

  it("ignores non-snowflake noise", () => {
    expect(parseSnowflakeList("hello world 123")).toEqual([]);
  });

  it("caps at MaxMassTargets", () => {
    const ids = Array.from({ length: 30 }, (_, i) =>
      String(100000000000000000n + BigInt(i)),
    );
    expect(parseSnowflakeList(ids.join(" "))).toHaveLength(MaxMassTargets);
  });
});

describe("resolveUsers", () => {
  it("fetches every id and drops ones that don't resolve", async () => {
    const fetch = vi.fn(async (id: string) =>
      id === "bad" ? Promise.reject(new Error("unknown")) : { id },
    );
    (container as any).client = { users: { fetch } };
    const users = await resolveUsers(["a", "bad", "b"]);
    expect(users.map((u) => u.id).sort()).toEqual(["a", "b"]);
  });
});

describe("resolveMembers", () => {
  it("prefers cache, falls back to fetch, drops misses", async () => {
    const cacheGet = vi.fn((id: string) => (id === "cached" ? { id } : undefined));
    const fetch = vi.fn(async (id: string) =>
      id === "fetched" ? { id } : Promise.reject(new Error("unknown")),
    );
    const guild = { members: { cache: { get: cacheGet }, fetch } } as any;
    const members = await resolveMembers(guild, ["cached", "fetched", "missing"]);
    expect(members.map((m) => m.id).sort()).toEqual(["cached", "fetched"]);
  });
});
