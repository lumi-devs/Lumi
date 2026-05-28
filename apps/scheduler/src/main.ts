// Real scheduler entrypoint (S5). Boots a full EmberClient in the `scheduler`
// role: no Discord WebSocket (ws.connect is patched out), but BullMQ Queue +
// Worker are active. Workers and the monolith publish RequestEnvelopes onto
// `ember.scheduler.request` (workers) or call `container.tasks.create()`
// directly (monolith); when a BullMQ job fires, each ScheduledTask piece
// re-publishes the effect onto `ember.scheduler.fire:<name>` for workers to
// execute (see packages/core/src/core/lib/scheduler-bus.ts).
import "./service-name.js";
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

const client = await EmberClient.bootstrap({ role: "scheduler" });

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
  container.logger.info("[Scheduler] Online (BullMQ owner; no Discord WS)");
} catch (err: unknown) {
  container.logger.fatal("[Scheduler] Fatal:", err);
  await client
    .destroy()
    .catch((err) =>
      container.logger.error("[Scheduler] Client destroy failed:", err),
    );
  process.exit(1);
}
