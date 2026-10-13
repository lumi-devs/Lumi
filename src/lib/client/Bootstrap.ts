process.env["NODE_ENV"] ??= "development";

import { Client } from "discord.js";
import { container, createServices, useServices } from "#src/lib/Services.js";
import { shutdownTracing, runDrainSequence } from "#src/observability/Index.ts";
import { attachClient, destroyLumi, loginLumi } from "#src/lib/client/LumiClient.js";
import { buildClientOptions } from "#src/lib/client/ClientOptions.js";
import {
  envParseString,
  validateAddonSignatureConfig,
  validateRequiredEnv,
} from "#src/lib/Env.js";
import { initializeShardLease, gracefulShutdown as clusterGracefulShutdown } from "#src/lib/sharding/ShardLease.js";
import { logError, errorFrom } from "#src/lib/utilities/Errors.js";
import { ExitCodes } from "#src/lib/ExitCodes.js";
import { consumeRestartRequested } from "#src/lib/Restart.js";

export interface BootstrapAppOptions {
  onlineMessage?: string;
  extraDrainSteps?: Array<{ name: string; run: () => Promise<void> | void }>;
}

let installedRejectionHandler: ((reason: unknown) => void) | null = null;
let installedExceptionHandler: ((err: unknown) => void) | null = null;

export function registerProcessErrorHandlers(): void {
  if (installedRejectionHandler) {
    process.off("unhandledRejection", installedRejectionHandler);
  }
  installedRejectionHandler = (reason: unknown) => {
    if (container.logger) {
      logError("Process: Unhandled promise rejection", reason);
    } else {
      console.error(
        "[Process: Unhandled promise rejection]",
        errorFrom(reason),
      );
    }
  };
  process.on("unhandledRejection", installedRejectionHandler);

  if (installedExceptionHandler) {
    process.off("uncaughtException", installedExceptionHandler);
  }
  installedExceptionHandler = (err: unknown) => {
    if (container.logger) {
      container.logger.fatal(
        "[Process] Uncaught exception - exiting:",
        errorFrom(err),
      );
    } else {
      console.error("[Process] Uncaught exception - exiting:", errorFrom(err));
    }
    process.exit(1);
  };
  process.on("uncaughtException", installedExceptionHandler);
}

export async function bootstrapClientApp(
  options: BootstrapAppOptions = {},
): Promise<Client> {
  try {
    validateRequiredEnv(["BOT_TOKEN", "APPEAL_TOKEN_SECRET"]);
    validateAddonSignatureConfig();
  } catch (err: unknown) {
    console.error(
      `[Lumi] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  registerProcessErrorHandlers();

  const onlineMsg = options.onlineMessage ?? "[Lumi] Online";

  let client: Client;
  try {
    client = new Client(buildClientOptions());
    const services = createServices(client);
    attachClient(client, services);
    useServices(services);
  } catch (err: unknown) {
    console.error(
      `[Lumi] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (process.env["LUMI_DRY_RUN"] === "1") {
    try {
      await container.db.probePrisma();
      await container.valkey.ping();
    } catch (err: unknown) {
      console.error(
        `[DryRun] dependency check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    container.logger.info("[DryRun] services ready - exiting without login");
    process.exit(0);
  }

  if (container.valkey) {
    await initializeShardLease(container.valkey).catch((err) => {
      container.logger?.warn?.("[ShardLease] Failed to initialize shard lease:", err);
    });
  }

  let shuttingDown = false;
  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.once(sig, async () => {
      if (shuttingDown) {
        container.logger?.warn?.("[Shutdown] second signal - force exiting");
        process.exit(130);
      }
      shuttingDown = true;
      const log = (
        level: "info" | "warn" | "error",
        msg: string,
        meta?: object,
      ) => container.logger[level](`[Shutdown] ${msg}`, meta ?? "");
      log("info", `${sig} received`);
      await clusterGracefulShutdown();
      const drainSteps = [
        ...(options.extraDrainSteps ?? []),
        { name: "client-destroy", run: () => destroyLumi(client, container) },
        { name: "tracing-shutdown", run: () => shutdownTracing() },
      ];
      try {
        await runDrainSequence(drainSteps, {
          log,
          preCloseGraceMs: 5_000,
          deadlineMs: 30_000,
        });
        process.exit(consumeRestartRequested() ? ExitCodes.RESTART : ExitCodes.SHUTDOWN);
      } catch (err: unknown) {
        log("error", "Drain sequence failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      }
    });
  });

  try {
    await loginLumi(client, container, envParseString("BOT_TOKEN"));
    container.logger.info(onlineMsg);
  } catch (err: unknown) {
    container.logger.fatal("[Lumi] Fatal:", err);
    await destroyLumi(client, container).catch((err: unknown) =>
      container.logger.error("[Lumi] Client destroy failed:", err),
    );
    process.exit(1);
  }

  return client;
}
