import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import { restoreBackup } from "../../modules/security/backup-store/restore.js";
import type { GuildBackupData } from "../../modules/security/backup-store/types.js";

const emptyData: GuildBackupData = { version: 1, roles: [], channels: [] };

const roleData = {
  version: 1,
  roles: [
    {
      id: "role-1",
      name: "Member",
      color: 0,
      hoist: false,
      position: 1,
      permissions: "0",
      mentionable: false,
      managed: false,
    },
  ],
  channels: [],
} as GuildBackupData;

describe("restoreBackup preflight", () => {
  it("aborts when the bot member cannot be resolved", async () => {
    const guild = { id: "guild-1", members: { me: null } } as unknown as Guild;

    const result = await restoreBackup({}, guild, emptyData);

    expect(result.aborted).toBe(true);
    expect(result.rolesCreated).toBe(0);
    expect(result.warnings).toEqual([
      "Could not resolve the bot member for this server.",
    ]);
  });

  it("aborts before mutating when Manage Roles is missing", async () => {
    const guild = {
      id: "guild-1",
      members: { me: { permissions: { has: () => false } } },
    } as unknown as Guild;

    const result = await restoreBackup({}, guild, roleData);

    expect(result.aborted).toBe(true);
    expect(result.rolesCreated).toBe(0);
    expect(result.warnings).toContain(
      "The bot is missing the Manage Roles permission.",
    );
  });
});
