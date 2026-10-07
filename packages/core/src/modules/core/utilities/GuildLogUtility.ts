import { defineUtility } from "#lib/module-system/Utility.js";
import type { Container } from "#lib/services.js";
import { queueSend } from "#lib/outbound/send-queue.js";
import type { AuditEntry } from "#lib/outbound/render.js";

export const guildLogUtility = defineUtility({
  name: "guild-log",

  /**
   * Queue an audit entry for the guild's log channel. Nobody is waiting on a
   * log line, so it goes through the outbound queue: a Discord outage or a
   * rate-limited log channel delays it instead of losing it, and never blocks
   * the handler that produced it.
   */
  async dispatch(services: Container, entry: AuditEntry): Promise<void> {
    const logChannelId = await services.db.config.getModuleConfig(
      entry.guildId,
      entry.moduleName ?? "core",
      "log_channel_id",
    );

    if (!logChannelId || typeof logChannelId !== "string") return;

    await queueSend(services, { channelId: logChannelId, auditEntry: entry });
  },
});

export type GuildLogUtility = typeof guildLogUtility;

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    "guild-log": typeof guildLogUtility;
  }
}
