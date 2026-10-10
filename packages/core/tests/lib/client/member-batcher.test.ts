import { describe, it, expect, vi, beforeEach } from "bun:test";
import { createMemberBatcher } from "@lumi/lib/client/member-batcher.js";
import { Guild, GuildMember } from "discord.js";

describe("createMemberBatcher", () => {
  let guild: Guild;
  let fetcher: (userId: string) => Promise<GuildMember | null>;

  beforeEach(() => {
    guild = {
      members: {
        fetch: vi.fn(),
      },
    } as unknown as Guild;
    fetcher = createMemberBatcher(guild, 50);
  });

  it("batches multiple fetches within the window", async () => {
    const member1 = { id: "user1", user: { id: "user1" } } as GuildMember;
    const member2 = { id: "user2", user: { id: "user2" } } as GuildMember;
    (guild.members.fetch as any).mockResolvedValue(new Map([
      ["user1", member1],
      ["user2", member2],
    ]));

    const [result1, result2] = await Promise.all([
      fetcher("user1"),
      fetcher("user2"),
    ]);

    expect(result1).toBe(member1);
    expect(result2).toBe(member2);
    expect(guild.members.fetch).toHaveBeenCalledTimes(1);
    expect(guild.members.fetch).toHaveBeenCalledWith({ user: ["user1", "user2"] });
  });

  it("returns null for missing members", async () => {
    const member1 = { id: "user1", user: { id: "user1" } } as GuildMember;
    (guild.members.fetch as any).mockResolvedValue(new Map([["user1", member1]]));

    const [result1, result2] = await Promise.all([
      fetcher("user1"),
      fetcher("user2"),
    ]);

    expect(result1).toBe(member1);
    expect(result2).toBeNull();
  });

  it("separate calls after window create new batch", async () => {
    const member1 = { id: "user1", user: { id: "user1" } } as GuildMember;
    const member2 = { id: "user2", user: { id: "user2" } } as GuildMember;
    (guild.members.fetch as any)
      .mockResolvedValueOnce(new Map([["user1", member1]]))
      .mockResolvedValueOnce(new Map([["user2", member2]]));

    await fetcher("user1");
    // Wait for the window to pass
    await new Promise((r) => setTimeout(r, 60));
    await fetcher("user2");

    expect(guild.members.fetch).toHaveBeenCalledTimes(2);
  });

  it("propagates errors to all batched callers", async () => {
    (guild.members.fetch as any).mockRejectedValueOnce(new Error("fetch failed"));

    const p1 = fetcher("user1").catch((e) => e);
    const p2 = fetcher("user2").catch((e) => e);

    const [e1, e2] = await Promise.all([p1, p2]);
    expect(e1?.message).toBe("fetch failed");
    expect(e2?.message).toBe("fetch failed");
  });
});