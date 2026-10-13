import { defineUtility } from "#src/lib/module-system/Utility.js";
import type { Container } from "#src/lib/Services.js";
import { queueSend } from "#src/lib/outbound/SendQueue.js";
import type { AuditEntry } from "#src/lib/outbound/Render.js";

export const guildLogUtility = defineUtility({
  name: "guild-log",

  async dispatch(services: Container, entry: AuditEntry): Promise<void> {
    const logChannelId =
      entry.channelId ??
      (await services.db.config.getModuleConfig(
        entry.guildId,
        entry.moduleName ?? "core",
        "log_channel_id",
      ));

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
