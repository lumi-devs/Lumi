import { type Container } from "#src/lib/Services.js";
import { Time } from "#src/shared/Index.ts";
import { registerTaskFireHandler } from "#src/lib/scheduler/Fires.js";
import { tryGetUtility } from "#src/lib/module-system/Utility.js";
import { handleSendMessageFire } from "#src/lib/outbound/SendQueue.js";
import { scheduleProcessRestart } from "#src/lib/Restart.js";
import { handleDataRetentionFire } from "#src/core/services/DataRetention.js";
import {
  handleGdprExportCleanupFire,
  handleGdprExportFire,
} from "#src/core/services/GdprExportTask.js";

async function handleFlushLogsFire(services: Container): Promise<void> {
  try {
    const count = await services.db.audit.flushAuditLogsToPostgres();
    if (count > 0) {
      services.logger.debug(
        `[FlushLogsTask] Flushed ${count} audit logs to Postgres.`,
      );
    }
  } catch (error) {
    services.logger.error(
      "[FlushLogsTask] Failed to flush audit logs:",
      error,
    );
  }
}

async function handleAddonAutoUpdateFire(services: Container): Promise<void> {
  try {
    const downloader = tryGetUtility("downloader");
    if (!downloader) return;

    const config = await downloader.getAutoUpdateConfig(services);
    if (!config.enabled) return;

    const dueForCheck =
      config.lastCheckedAt === null ||
      Date.now() - config.lastCheckedAt.getTime() >=
        config.intervalMinutes * Time.Minute;
    if (!dueForCheck) return;

    const pending = await downloader.checkForUpdates(services);
    let restartNeeded = false;
    for (const moduleName of pending) {
      try {
        const res = await downloader.updateModule(services, moduleName);
        if (res.needsRestart) restartNeeded = true;
      } catch (err: unknown) {
        services.logger.warn(
          `[AddonAutoUpdate] Failed to update ${moduleName}: ${String(err)}`,
        );
      }
    }

    await downloader.setAutoUpdateConfig(services, { lastCheckedAt: new Date() });

    if (restartNeeded) {
      scheduleProcessRestart(services, "addon auto-update");
    }
  } catch (error) {
    services.logger.error("[AddonAutoUpdate] Sweep failed:", error);
  }
}

export function registerCoreFireHandlers(): void {
  registerTaskFireHandler("flush-logs", "unicast", handleFlushLogsFire);
  registerTaskFireHandler("send-message", "unicast", handleSendMessageFire);
  registerTaskFireHandler(
    "addon-auto-update",
    "unicast",
    handleAddonAutoUpdateFire,
  );
  registerTaskFireHandler(
    "data-retention-sweep",
    "unicast",
    handleDataRetentionFire,
  );
  registerTaskFireHandler("gdpr-export", "unicast", handleGdprExportFire);
  registerTaskFireHandler(
    "gdpr-export-cleanup",
    "unicast",
    handleGdprExportCleanupFire,
  );
}
