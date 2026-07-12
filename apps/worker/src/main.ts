import "./telemetry.js";
import "@lumi/core/setup";
import { container } from "@sapphire/framework";
import { shutdownTracing, runDrainSequence } from "@lumi/observability";
import * as Sentry from "@sentry/node";
import { LumiClient, envIsDefined, envParseString } from "@lumi/core";

if (
  envParseString("SENTRY_ENABLED", "false") === "true" &&
  envIsDefined("SENTRY_DSN")
) {
  Sentry.init({
    dsn: envParseString("SENTRY_DSN"),
    integrations: [
      Sentry.consoleIntegration(),
      Sentry.httpIntegration({ breadcrumbs: true }),
      Sentry.prismaIntegration(),
    ],
    environment: envParseString("NODE_ENV"),
    tracesSampleRate: 0.1,
  });
}

const client = await LumiClient.bootstrap().catch((err: unknown): never => {
  console.error(
    `[Startup] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});

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
    await runDrainSequence(
      [
        { name: "client-destroy", run: () => client.destroy() },
        { name: "tracing-shutdown", run: () => shutdownTracing() },
      ],
      { log, preCloseGraceMs: 5_000, deadlineMs: 30_000 },
    );
    process.exit(0);
  });
});

try {
  await client.login(envParseString("BOT_TOKEN"));
  container.logger.info("[Startup] Online");
} catch (err: unknown) {
  container.logger.fatal("[Startup] Fatal:", err);
  await client
    .destroy()
    .catch((err) =>
      container.logger.error("[Main] Client destroy failed:", err),
    );
  process.exit(1);
}
