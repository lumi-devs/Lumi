import { describe, it, expect } from "bun:test";
import { permitSubject } from "#lib/permissions/subject.js";

interface GuildStub {
  id: string;
  ownerId: string;
}

function fakeRoleCache(roles: Array<{ id: string; position: number }>): Map<string, { position: number }> {
  const map = new Map<string, { position: number }>();
  for (const r of roles) map.set(r.id, { position: r.position });
  return map;
}

describe("permitSubject", () => {
  it("returns null when there's no guild", () => {
    expect(permitSubject(null, "user-1", null, "c")).toBeNull();
  });

  it("builds a subject with roles ordered highest position first", () => {
    const guild: GuildStub = { id: "g", ownerId: "o" };
    const member = {
      roles: {
        cache: fakeRoleCache([
          { id: "G1", position: 0 },
          { id: "R_LOW", position: 1 },
          { id: "R_HIGH", position: 5 },
        ]),
      },
    };

    expect(permitSubject(guild, "user-1", member, "c")).toEqual({
      guildId: "g",
      userId: "user-1",
      roleIds: ["R_HIGH", "R_LOW", "G1"],
      channelId: "c",
      guildOwnerId: "o",
    });
  });

  it("turns a null channelId into undefined", () => {
    const guild: GuildStub = { id: "g", ownerId: "o" };

    const subject = permitSubject(guild, "user-1", null, null);

    expect(subject?.channelId).toBeUndefined();
  });
});
