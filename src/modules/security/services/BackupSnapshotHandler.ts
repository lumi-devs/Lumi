import { type Container } from "#src/lib/Services.js";

import { mapWithConcurrency } from "#src/lib/utilities/Concurrency.js";
import { loadAntiNukeConfig } from "#src/modules/security/services/AntiNuke.js";
import { loadBackupConfig, createBackup } from "#src/modules/security/services/Backup.js";

const HourMs = 60 * 60 * 1000;

const BackupConcurrency = 5;

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
