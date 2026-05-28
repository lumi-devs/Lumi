import "./telemetry.js";
import "@ember/core/setup";
import { container } from "@sapphire/framework";
import { shutdownTracing } from "@ember/observability";
import * as Sentry from "@sentry/node";
import { EmberClient, envIsDefined, envParseString } from "@ember/core";

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

const client = await EmberClient.bootstrap();

["SIGINT", "SIGTERM"].forEach((sig) => {
  process.once(sig, async () => {
    container.logger.info(`[Shutdown] ${sig} received`);
    await client
      .destroy()
      .catch((err) => container.logger.error("[Shutdown] Failed:", err));
    await shutdownTracing();
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
