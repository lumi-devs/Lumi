import { container } from "@sapphire/framework";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { getService } from "#lib/module-system/Service.js";
import { handleSendMessageFire } from "#lib/outbound/send-queue.js";
import { scheduleProcessRestart } from "#lib/restart.js";

async function handleFlushLogsFire(): Promise<void> {
  try {
    const count = await container.db.audit.flushAuditLogsToPostgres(500);
    if (count > 0) {
      container.logger.debug(
        `[FlushLogsTask] Flushed ${count} audit logs to Postgres.`,
      );
    }
  } catch (error) {
    container.logger.error(
      "[FlushLogsTask] Failed to flush audit logs:",
      error,
    );
  }
}

async function handleAddonAutoUpdateFire(): Promise<void> {
  try {
    const downloader = getService("downloader");
    const config = await downloader.getAutoUpdateConfig();
    if (!config.enabled) return;

    const dueForCheck =
      config.lastCheckedAt === null ||
      Date.now() - config.lastCheckedAt >= config.intervalMinutes * 60_000;
    if (!dueForCheck) return;

    const pending = await downloader.checkForUpdates();
    let restartNeeded = false;
    for (const moduleName of pending) {
      try {
        const res = await downloader.updateModule(moduleName);
        if (res.needsRestart) restartNeeded = true;
      } catch (err: unknown) {
        container.logger.warn(
          `[AddonAutoUpdate] Failed to update ${moduleName}: ${String(err)}`,
        );
      }
    }

    await downloader.setAutoUpdateConfig({ lastCheckedAt: Date.now() });

    if (restartNeeded) {
      scheduleProcessRestart("addon auto-update");
    }
  } catch (error) {
    container.logger.error("[AddonAutoUpdate] Sweep failed:", error);
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
}
