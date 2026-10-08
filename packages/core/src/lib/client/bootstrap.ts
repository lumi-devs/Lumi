process.env["NODE_ENV"] ??= "development";

import { Client } from "discord.js";
import { container, createServices, useServices } from "#lib/services.js";
import { shutdownTracing, runDrainSequence } from "@lumi/observability";
import { attachClient, destroyLumi, loginLumi } from "./LumiClient.js";
import { buildClientOptions } from "./client-options.js";
import {
  envParseString,
  validateAddonSignatureConfig,
  validateRequiredEnv,
} from "#lib/env.js";
import { initializeShardLease, gracefulShutdown as clusterGracefulShutdown } from "#lib/cluster/shard-lease.js";
import { logError, errorFrom } from "#lib/utilities/errors.js";

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

  if (container.valkey) {
    await initializeShardLease(container.valkey).catch((err) => {
      container.logger?.warn?.("[ShardLease] Failed to initialize shard lease:", err);
    });
  }

  let shuttingDown = false;
  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.once(sig, async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      const log = (
        level: "info" | "warn" | "error",
        msg: string,
        meta?: object,
      ) => container.logger[level](`[Shutdown] ${msg}`, meta ?? "");
      log("info", `${sig} received`);
      await clusterGracefulShutdown();
      const drainSteps = [
        { name: "addon-shutdown", run: () => container.moduleStore?.stopAddonProcesses() },
        { name: "client-destroy", run: () => destroyLumi(client, container) },
        ...(options.extraDrainSteps ?? []),
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
