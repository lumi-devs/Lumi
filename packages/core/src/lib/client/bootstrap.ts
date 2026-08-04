import { container } from "@sapphire/framework";
import { toTitleCase } from "@sapphire/utilities";
import { shutdownTracing, runDrainSequence } from "@lumi/observability";
import { LumiClient } from "./LumiClient.js";
import { envParseString } from "#lib/env.js";
import { logError, errorFrom } from "#lib/utilities/errors.js";

export interface BootstrapAppOptions extends LumiClient.Options {
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
    logError("Process: Unhandled promise rejection", reason);
  };
  process.on("unhandledRejection", installedRejectionHandler);

  if (installedExceptionHandler) {
    process.off("uncaughtException", installedExceptionHandler);
  }
  installedExceptionHandler = (err: unknown) => {
    container.logger.fatal(
      "[Process] Uncaught exception - exiting:",
      errorFrom(err),
    );
    process.exit(1);
  };
  process.on("uncaughtException", installedExceptionHandler);
}

export async function bootstrapClientApp(
  options: BootstrapAppOptions = {},
): Promise<LumiClient> {
  registerProcessErrorHandlers();

  const roleName = options.role ?? "worker";
  const onlineMsg =
    options.onlineMessage ??
    `[${toTitleCase(roleName)}] Online`;

  const client = await LumiClient.bootstrap(options).catch(
    (err: unknown): never => {
      console.error(
        `[${roleName}] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    },
  );

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
      const drainSteps = [
        { name: "client-destroy", run: () => client.destroy() },
        ...(options.extraDrainSteps ?? []),
        { name: "tracing-shutdown", run: () => shutdownTracing() },
      ];
      await runDrainSequence(drainSteps, {
        log,
        preCloseGraceMs: 5_000,
        deadlineMs: 30_000,
      });
      process.exit(0);
    });
  });

  try {
    await client.login(envParseString("BOT_TOKEN"));
    container.logger.info(onlineMsg);
  } catch (err: unknown) {
    container.logger.fatal(`[${roleName}] Fatal:`, err);
    await client
      .destroy()
      .catch((err: unknown) =>
        container.logger.error(`[${roleName}] Client destroy failed:`, err),
      );
    process.exit(1);
  }

  return client;
}
