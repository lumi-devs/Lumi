import { container } from "#src/lib/Services.js";
import type { Guild } from "discord.js";
import { ValkeyKeys } from "#src/lib/valkey/Store.js";
import { snapshotGuild } from "#src/modules/security/data/BackupTypes.js";
import { restoreGuildFromBackup } from "#src/modules/security/services/RestoreGuild.js";
import { getConfigNumber } from "#src/modules/security/services/ConfigHelpers.js";

export async function loadBackupConfig(
  guildId: string,
): Promise<{ intervalHours: number; keepCount: number }> {
  const raw = await container.db.config.getAllModuleConfig(guildId, "security");
  return {
    intervalHours: getConfigNumber(raw, "backup_interval_hours", 3),
    keepCount: getConfigNumber(raw, "backup_keep_count", 10),
  };
}

export async function createBackup(guild: Guild, keepCount: number): Promise<number> {
  const data = snapshotGuild(guild);
  const backup = await container.db.security.createBackup(guild.id, data);
  await container.db.security.pruneBackups(guild.id, keepCount);
  return backup.id;
}

export async function flagRestorePending(guildId: string): Promise<void> {
  await container.valkey.set(
    ValkeyKeys.securityRestorePending(guildId),
    "1",
    "EX",
    24 * 60 * 60,
  );
}

export async function isRestorePending(guildId: string): Promise<boolean> {
  return (
    (await container.valkey.exists(ValkeyKeys.securityRestorePending(guildId))) === 1
  );
}

export async function clearRestorePending(guildId: string): Promise<void> {
  await container.invalidation.invalidate(
    ValkeyKeys.securityRestorePending(guildId),
  );
}

export async function restoreFromBackup(
  guildId: string,
  backupId?: number,
): Promise<{ rolesRestored: number; channelsRestored: number } | null> {
  return restoreGuildFromBackup(guildId, backupId);
}
