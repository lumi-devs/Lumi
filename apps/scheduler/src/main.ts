import "./telemetry.js";
import "@lumi/core/setup";

import { container } from "@sapphire/framework";
import { shutdownTracing, runDrainSequence } from "@lumi/observability";
import { LumiClient, envParseString } from "@lumi/core";

const client = await LumiClient.bootstrap({ role: "scheduler" }).catch(
  (err: unknown): never => {
    console.error(
      `[Scheduler] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
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
