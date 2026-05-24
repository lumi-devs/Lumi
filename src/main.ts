import "./client/setup.js";
import { container } from "@sapphire/framework";
import { envIsDefined, envParseString } from "#lib/env.js";
import * as Sentry from "@sentry/node";
import { EmberClient } from "./client/EmberClient.js";

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

const client = new EmberClient();

["SIGINT", "SIGTERM"].forEach((sig) => {
  process.once(sig, async () => {
    container.logger.info(`[Shutdown] ${sig} received`);
    await client
      .destroy()
      .catch((err) => container.logger.error("[Shutdown] Failed:", err));
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
