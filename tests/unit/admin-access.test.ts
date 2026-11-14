import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  hasAdminAccess,
  hasPermitAccess,
  roleIdsFrom,
} from "../../src/admin/access.ts";

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

  it("requires a permit when enforcement is enabled", async () => {
    const repo = permits(false);

    await expect(
      hasAdminAccess({
        guildId: "guild",
        userId: "user",
        roleIds: [],
        enforcePermits: true,
        memberPermissions: {
          has: (permission) => permission === PermissionFlagsBits.ManageGuild,
        },
        permits: repo,
      }),
    ).resolves.toBe(false);
    expect(repo.explainPermit).toHaveBeenCalledWith(
      expect.objectContaining({ managerBypass: false }),
      undefined,
    );
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

describe("hasPermitAccess", () => {
  it("evaluates the requested permit node with channel context", async () => {
    const repo = permits(true);

    await expect(
      hasPermitAccess(
        {
          guildId: "guild",
          userId: "user",
          roleIds: ["role"],
          channelId: "channel",
          client: { tag: "client" },
          permits: repo,
        },
        "mod.ban",
      ),
    ).resolves.toBe(true);
    expect(repo.explainPermit).toHaveBeenCalledWith(
      {
        guildId: "guild",
        userId: "user",
        roleIds: ["role"],
        channelId: "channel",
        guildOwnerId: undefined,
        permitNode: "mod.ban",
      },
      { tag: "client" },
    );
  });

  it("returns false when the permit is denied", async () => {
    const repo = permits(false);

    await expect(
      hasPermitAccess(
        { guildId: "guild", userId: "user", roleIds: [], permits: repo },
        "mod.ban",
      ),
    ).resolves.toBe(false);
  });

  it("disables the manager bypass when permits are enforced", async () => {
    const repo = permits(false);
    await hasPermitAccess(
      {
        guildId: "guild",
        userId: "manager",
        roleIds: [],
        enforcePermits: true,
        permits: repo,
      },
      "mod.ban",
    );

    expect(repo.explainPermit).toHaveBeenCalledWith(
      expect.objectContaining({ managerBypass: false }),
      undefined,
    );
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
