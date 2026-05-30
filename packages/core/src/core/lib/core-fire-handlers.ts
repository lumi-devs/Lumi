// Fire handlers for ScheduledTask pieces that live outside any module
// (currently just `flush-logs`). Wired up by LumiClient on worker/monolith
// roles, before TaskFireConsumer starts.

import { container } from "@sapphire/framework";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";

async function handleFlushLogsFire(): Promise<void> {
  try {
    const count = await container.db.audit.flushAuditLogsToPostgres(500);
    if (count > 0) {
      container.logger.debug(
        `[FlushLogsTask] Flushed ${count} audit logs to Postgres.`,
      );
    }
  } catch (error) {
    container.logger.error(
      "[FlushLogsTask] Failed to flush audit logs:",
      error,
    );
  }
}

export function registerCoreFireHandlers(): void {
  registerTaskFireHandler("flush-logs", "unicast", handleFlushLogsFire);
}
