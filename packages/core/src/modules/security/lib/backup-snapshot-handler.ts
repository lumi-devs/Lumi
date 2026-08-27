import { container } from "@sapphire/framework";
import { tryGetService } from "#lib/module-system/Service.js";

import { mapWithConcurrency } from "#lib/utilities/concurrency.js";

const HOUR_MS = 60 * 60 * 1000;

/** createBackup is Discord-API heavy, so this fan-out stays tighter than the sweeps. */
const BACKUP_CONCURRENCY = 5;

/**
 * Broadcast fire handler for the hourly backup sweep. Each worker iterates
 * its own `guilds.cache` (shard affinity preserved) and snapshots any guild
 * whose anti-nuke protection is on and whose last backup is older than its
 * configured interval.
 */
export async function handleBackupSnapshotFire(): Promise<void> {
  const security = tryGetService("security");
  if (!security) return;

  const guilds = [...container.client.guilds.cache.values()];
  await mapWithConcurrency(guilds, BACKUP_CONCURRENCY, async (guild) => {
    const enabled = await container.db.modules
      .isModuleEnabled(guild.id, "security")
      .catch(() => false);
    if (!enabled) return;

    const antiNuke = await security.loadAntiNukeConfig(guild.id);
    if (!antiNuke.enabled) return;

    const { intervalHours, keepCount } = await security.loadBackupConfig(guild.id);
    const latest = await container.db.security.getLatestBackup(guild.id);
    const dueAt = latest ? latest.createdAt.getTime() + intervalHours * HOUR_MS : 0;
    if (Date.now() < dueAt) return;

    await security.createBackup(guild, keepCount).catch((err: unknown) => {
      container.logger.error(
        `[security] Backup snapshot failed for ${guild.id}:`,
        err,
      );
    });
  });
}
