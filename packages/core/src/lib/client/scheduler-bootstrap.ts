import { disconnectDatabase } from "#lib/prisma/client.js";
import { logError, errorFrom } from "#lib/utilities/errors.js";
import { shutdownTracing, runDrainSequence } from "@lumi/observability";
import { container } from "#lib/services.js";
import {
  installSchedulerContainerServices,
  type SchedulerContainerServices,
} from "./scheduler-container-services.js";

export interface BootstrapSchedulerAppOptions {
  extraDrainSteps?: Array<{ name: string; run: () => Promise<void> | void }>;
}

let installedRejectionHandler: ((reason: unknown) => void) | null = null;
let installedExceptionHandler: ((err: unknown) => void) | null = null;

// Process-level unhandled rejection and uncaught exception handlers for Scheduler.
function registerProcessErrorHandlers(): void {
  if (installedRejectionHandler) {
    process.off("unhandledRejection", installedRejectionHandler);
  }
  installedRejectionHandler = (reason: unknown) => {
    if (container.logger) {
      logError("Process: Unhandled promise rejection", reason);
    } else {
      console.error("[Process: Unhandled promise rejection]", errorFrom(reason));
    }
  };
  process.on("unhandledRejection", installedRejectionHandler);

  if (installedExceptionHandler) {
    process.off("uncaughtException", installedExceptionHandler);
  }
  installedExceptionHandler = (err: unknown) => {
    if (container.logger) {
      container.logger.fatal("[Process] Uncaught exception - exiting:", errorFrom(err));
    } else {
      console.error("[Process] Uncaught exception - exiting:", errorFrom(err));
    }
    process.exit(1);
  };
  process.on("uncaughtException", installedExceptionHandler);
}

/**
 * Tears down everything `installSchedulerContainerServices()` opened, in
 * reverse order.
 */
export async function destroySchedulerContainerServices(
  services: SchedulerContainerServices,
): Promise<void> {
  const warnOnCleanupError = (what: string) => (err: unknown) =>
    container.logger.warn(`[Scheduler] ${what} failed:`, err);

  await services.failedJobsWatcher
    .close()
    .catch(warnOnCleanupError("Failed-jobs watcher close"));
  await services.queueDepthWatcher
    .close()
    .catch(warnOnCleanupError("Queue-depth watcher close"));
  await services.heartbeatWatcher
    .close()
    .catch(warnOnCleanupError("Heartbeat watcher close"));
  if (container.tasks) {
    await container.tasks
      .close()
      .catch(warnOnCleanupError("ScheduledTasks (BullMQ) close"));
  }
  await services.schedulerLock
    .release()
    .catch(warnOnCleanupError("Scheduler lock release"));
  await services.ownedEventBus.close().catch(warnOnCleanupError("EventBus close"));
  await container.invalidation.close().catch(warnOnCleanupError("Invalidation close"));
  await container.signals.close().catch(warnOnCleanupError("Signals close"));
  await container.valkey.quit().catch(warnOnCleanupError("Valkey quit"));
  await disconnectDatabase().catch(warnOnCleanupError("Database disconnect"));
}

/**
 * `bootstrapClientApp()`/`bootstrapApiApp()`'s counterpart for the
 * gateway-free scheduler process: same process-error-handler / drain-on-signal
 * shape, but wires `installSchedulerContainerServices()` and never calls
 * `client.login()`. No required-env check on `BOT_TOKEN` here - unlike
 * `apps/api`, this process never authenticates a REST client or reads the
 * bot's own id, so it has nothing that needs the token.
 */
export async function bootstrapSchedulerApp(
  options: BootstrapSchedulerAppOptions = {},
): Promise<SchedulerContainerServices> {
  registerProcessErrorHandlers();

  let services: SchedulerContainerServices;
  try {
    services = await installSchedulerContainerServices();
  } catch (err: unknown) {
    console.error(
      `[Scheduler] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  let shuttingDown = false;
  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.once(sig, async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      const log = (level: "info" | "warn" | "error", msg: string, meta?: object) =>
        container.logger[level](`[Shutdown] ${msg}`, meta ?? "");
      log("info", `${sig} received`);
      const drainSteps = [
        ...(options.extraDrainSteps ?? []),
        {
          name: "scheduler-container-services",
          run: () => destroySchedulerContainerServices(services),
        },
        { name: "tracing-shutdown", run: () => shutdownTracing() },
      ];
      try {
        await runDrainSequence(drainSteps, {
          log,
          preCloseGraceMs: 5_000,
          deadlineMs: 30_000,
        });
        process.exit(0);
      } catch (err: unknown) {
        log("error", "Drain sequence failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      }
    });
  });

  return services;
}
