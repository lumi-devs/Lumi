import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  hasAdminAccess,
  hasExtraOwnerAccess,
  roleIdsFrom,
} from "../../apps/bot/src/admin/src/access.ts";

function permits(allowed: boolean) {
  return {
    explainPermit: vi.fn(async () => ({ allowed, rows: [] })),
  } as any;
}

describe("hasAdminAccess", () => {
  it("allows a member with Manage Server", async () => {
    const repo = permits(false);

    await expect(
      hasAdminAccess({
        guildId: "guild",
        userId: "user",
        roleIds: [],
        memberPermissions: {
          has: (permission) => permission === PermissionFlagsBits.ManageGuild,
        },
        permits: repo,
      }),
    ).resolves.toBe(true);
    expect(repo.explainPermit).not.toHaveBeenCalled();
  });

  it("allows a member with an admin permit", async () => {
    const repo = permits(true);

    await expect(
      hasAdminAccess({
        guildId: "guild",
        userId: "user",
        roleIds: ["role"],
        guildOwnerId: "owner",
        memberPermissions: { has: () => false },
        client: { tag: "client" },
        permits: repo,
      }),
    ).resolves.toBe(true);
    expect(repo.explainPermit).toHaveBeenCalledWith(
      {
        guildId: "guild",
        userId: "user",
        roleIds: ["role"],
        guildOwnerId: "owner",
        permitNode: "admin.*",
      },
      { tag: "client" },
    );
  });

  it("denies a member without an admin permit", async () => {
    const repo = permits(false);

    await expect(
      hasAdminAccess({
        guildId: "guild",
        userId: "user",
        roleIds: [],
        memberPermissions: { has: () => false },
        permits: repo,
      }),
    ).resolves.toBe(false);
  });
});

describe("hasExtraOwnerAccess", () => {
  it("allows an Extra Owner permit holder", async () => {
    const repo = {
      hasGrantNode: vi.fn(async () => true),
    } as any;

    await expect(
      hasExtraOwnerAccess({
        guildId: "guild",
        userId: "user",
        roleIds: ["role"],
        permits: repo,
      }),
    ).resolves.toBe(true);
    expect(repo.hasGrantNode).toHaveBeenCalledWith({
      guildId: "guild",
      userId: "user",
      roleIds: ["role"],
      permitNode: "*",
    });
  });

  it("denies a Trusted Admin without an Extra Owner grant", async () => {
    const repo = {
      hasGrantNode: vi.fn(async () => false),
    } as any;

    await expect(
      hasExtraOwnerAccess({
        guildId: "guild",
        userId: "user",
        roleIds: [],
        permits: repo,
      }),
    ).resolves.toBe(false);
  });
});

describe("roleIdsFrom", () => {
  it("returns role IDs without the guild role", () => {
    const member = {
      roles: {
        cache: new Map([
          ["guild", { id: "guild" }],
          ["role-a", { id: "role-a" }],
          ["role-b", { id: "role-b" }],
        ]),
      },
    };

    expect(roleIdsFrom(member, "guild")).toEqual(["role-a", "role-b"]);
  });

  it("returns role IDs from an API member", () => {
    expect(roleIdsFrom({ roles: ["guild", "role-a"] }, "guild")).toEqual([
      "role-a",
    ]);
  });

  it("returns an empty list when roles are unavailable", () => {
    expect(roleIdsFrom(null, "guild")).toEqual([]);
  });
});
