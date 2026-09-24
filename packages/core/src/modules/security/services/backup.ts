import { container } from "@sapphire/framework";
import type { Guild } from "discord.js";
import { RedisKeys } from "#lib/database/redis.js";
import { snapshotGuild } from "./backup-types.js";
import { restoreGuildFromBackup } from "./restore-guild.js";
import { getConfigNumber } from "./config-helpers.js";

export async function loadBackupConfig(
  guildId: string,
): Promise<{ intervalHours: number; keepCount: number }> {
  const raw = await container.db.config.getAllModuleConfig(guildId, "security");
  return {
    intervalHours: getConfigNumber(raw, "backup_interval_hours", 3),
    keepCount: getConfigNumber(raw, "backup_keep_count", 10),
  };
}

/** Snapshots the guild's role/channel structure and prunes old backups past `keepCount`. */
export async function createBackup(guild: Guild, keepCount: number): Promise<number> {
  const data = snapshotGuild(guild);
  const backup = await container.db.security.createBackup(guild.id, data);
  await container.db.security.pruneBackups(guild.id, keepCount);
  return backup.id;
}

/** Marks the guild as having lost structure during the current panic window, for auto-restore on revert. */
export async function flagRestorePending(guildId: string): Promise<void> {
  await container.redis.set(
    RedisKeys.securityRestorePending(guildId),
    "1",
    "EX",
    24 * 60 * 60,
  );
}

export async function isRestorePending(guildId: string): Promise<boolean> {
  return (
    (await container.redis.exists(RedisKeys.securityRestorePending(guildId))) === 1
  );
}

export async function clearRestorePending(guildId: string): Promise<void> {
  await container.invalidation.invalidate(
    RedisKeys.securityRestorePending(guildId),
  );
}

/**
 * Recreates roles and channels present in the snapshot but missing from
 * the guild now. Best-effort: exact position/id can't be preserved (a
 * recreated role/channel gets a new Discord id), only name, permissions,
 * hierarchy-adjacent position, and (for channels) parent + overwrites.
 */
export async function restoreFromBackup(
  guild: Guild,
  backupId?: number,
): Promise<{ rolesRestored: number; channelsRestored: number } | null> {
  return restoreGuildFromBackup(guild, backupId);
}
