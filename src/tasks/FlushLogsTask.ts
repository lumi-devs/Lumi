import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";

export class FlushLogsTask extends ScheduledTask {
  public constructor(
    context: ScheduledTask.LoaderContext,
    options: ScheduledTask.Options,
  ) {
    super(context, {
      ...options,
      name: "flush-logs",
      interval: 5000,
    });
  }

  public async run() {
    try {
      const count = await this.container.db.flushAuditLogsToPostgres(500);
      if (count > 0) {
        this.container.logger.debug(
          `[FlushLogsTask] Flushed ${count} audit logs to Postgres.`,
        );
      }
    } catch (error) {
      this.container.logger.error(
        "[FlushLogsTask] Failed to flush audit logs:",
        error,
      );
    }
  }
}
