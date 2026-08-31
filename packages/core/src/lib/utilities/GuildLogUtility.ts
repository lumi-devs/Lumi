import { Utility } from "#lib/module-system/Utility.js";
import { ApplyOptions } from "@sapphire/decorators";
import { container, type Piece } from "@sapphire/framework";
import { queueSend } from "#lib/outbound/send-queue.js";
import type { AuditEntry } from "#lib/loggable.js";

@ApplyOptions<Piece.Options>({ name: "guild-log" })
export class GuildLogUtility extends Utility {
  /**
   * Queue an audit entry for the guild's log channel. Nobody is waiting on a
   * log line, so it goes through the outbound queue: a Discord outage or a
   * rate-limited log channel delays it instead of losing it, and never blocks
   * the handler that produced it.
   */
  public async dispatch(entry: AuditEntry): Promise<void> {
    const logChannelId = await container.db.config.getModuleConfig(
      entry.guildId,
      entry.moduleName ?? "core",
      "log_channel_id",
    );

    if (!logChannelId || typeof logChannelId !== "string") return;

    await queueSend({ channelId: logChannelId, auditEntry: entry });
  }
}

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    "guild-log": GuildLogUtility;
  }
}
