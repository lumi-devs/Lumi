import { type Container } from "@lumi/lib/services.js";

import { mapWithConcurrency } from "@lumi/lib/utilities/concurrency.js";
import { loadAntiNukeConfig } from "./anti-nuke.js";
import { loadBackupConfig, createBackup } from "./backup.js";

const HourMs = 60 * 60 * 1000;

/** createBackup is Discord-API heavy, so this fan-out stays tighter than the sweeps. */
const BackupConcurrency = 5;

/** Each worker iterates its own `guilds.cache` (shard affinity preserved). */
export async function handleBackupSnapshotFire(services: Container): Promise<void> {
  const guilds = [...services.client.guilds.cache.values()];
  await mapWithConcurrency(guilds, BackupConcurrency, async (guild) => {
    const enabled = await services.db.modules
      .isModuleEnabled(guild.id, "security")
      .catch(() => false);
    if (!enabled) return;

    const antiNuke = await loadAntiNukeConfig(guild.id);
    if (!antiNuke.enabled) return;

    const { intervalHours, keepCount } = await loadBackupConfig(guild.id);
    const latest = await services.db.security.getLatestBackup(guild.id);
    const dueAt = latest ? latest.createdAt.getTime() + intervalHours * HourMs : 0;
    if (Date.now() < dueAt) return;

    await createBackup(guild, keepCount).catch((err: unknown) => {
      services.logger.error(
        `[security] Backup snapshot failed for ${guild.id}:`,
        err,
      );
    });
  });
}
