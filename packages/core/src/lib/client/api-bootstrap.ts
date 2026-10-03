import { disconnectDatabase } from "#lib/prisma/client.js";
import { validateRequiredEnv } from "#lib/env.js";
import { logError, errorFrom } from "#lib/utilities/errors.js";
import { shutdownTracing, runDrainSequence } from "@lumi/observability";
import { container } from "@sapphire/framework";
import {
  installApiContainerServices,
  type ApiContainerServices,
} from "./api-container-services.js";

export interface BootstrapApiAppOptions {
  extraDrainSteps?: Array<{ name: string; run: () => Promise<void> | void }>;
}

let installedRejectionHandler: ((reason: unknown) => void) | null = null;
let installedExceptionHandler: ((err: unknown) => void) | null = null;

// Same shape as `registerProcessErrorHandlers` in `api-bootstrap.ts`'s worker
// counterpart (`bootstrap.ts`) - kept as its own copy rather than a shared
// export because the two apps' process lifecycles are meant to evolve
// independently once Phase C lands the RPC server here.
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
 * Tears down everything `installApiContainerServices()` opened, in reverse
 * order. Mirrors `LumiClient.destroy()`'s cleanup for the subset of
 * resources this process actually owns - no RPC HTTP server, no BullMQ
 * worker, no task-fire consumer, no scheduler lock, since none of those are
 * wired up until Phase C.
 */
export async function destroyApiContainerServices(
  services: ApiContainerServices,
): Promise<void> {
  const warnOnCleanupError = (what: string) => (err: unknown) =>
    container.logger.warn(`[Api] ${what} failed:`, err);

  await services.ownedEventBus.close().catch(warnOnCleanupError("EventBus close"));
  await container.invalidation.close().catch(warnOnCleanupError("Invalidation close"));
  await container.signals.close().catch(warnOnCleanupError("Signals close"));
  await container.redis.quit().catch(warnOnCleanupError("Redis quit"));
  await disconnectDatabase().catch(warnOnCleanupError("Database disconnect"));
}

/**
 * `bootstrapClientApp()`'s counterpart for the gateway-free API process: same
 * env validation / process-error-handler / drain-on-signal shape, but wires
 * `installApiContainerServices()` instead of constructing a `LumiClient`, and
 * never calls `client.login()`.
 */
export async function bootstrapApiApp(
  options: BootstrapApiAppOptions = {},
): Promise<ApiContainerServices> {
  try {
    validateRequiredEnv(["BOT_TOKEN"]);
  } catch (err: unknown) {
    console.error(
      `[Api] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  registerProcessErrorHandlers();

  let services: ApiContainerServices;
  try {
    services = await installApiContainerServices();
  } catch (err: unknown) {
    console.error(
      `[Api] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
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
        // Stop accepting/draining external traffic (e.g. the RPC HTTP
        // server) before tearing down the redis/db/event-bus connections it
        // depends on - otherwise an in-flight request can hit a connection
        // that's already been closed. `runDrainSequence` runs these strictly
        // sequentially, so order here is the actual shutdown order.
        ...(options.extraDrainSteps ?? []),
        { name: "api-container-services", run: () => destroyApiContainerServices(services) },
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
