import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import { container, type Piece } from "@sapphire/framework";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { Colors } from "discord.js";
import { makeCard } from "#utilities/cards.js";
import type { AuditEntry } from "#core/lib/loggable.js";

@ApplyOptions<Piece.Options>({ name: "guild-log" })
export class GuildLogService extends Service {
  public async dispatch(entry: AuditEntry): Promise<void> {
    const logChannelId = await container.db.config.getModuleConfig(
      entry.guildId,
      entry.moduleName ?? "core",
      "log_channel_id",
    );

    if (!logChannelId || typeof logChannelId !== "string") return;

    const channel = container.client.channels.cache.get(logChannelId);
    if (!channel?.isTextBased() || !("send" in channel)) return;

    const title =
      entry.caseNumber != null
        ? `${entry.action} — Case #${entry.caseNumber}`
        : entry.action;

    const lines = [
      `**Target**: ${userMention(entry.targetId)} (${entry.targetId})`,
      `**Moderator**: ${userMention(entry.actorId)} (${entry.actorId})`,
    ];

    if (entry.reason) {
      lines.push(`**Reason**: ${entry.reason}`);
    }

    if (entry.extra) {
      for (const [key, val] of Object.entries(entry.extra)) {
        lines.push(`**${key}**: ${String(val)}`);
      }
    }

    const card = makeCard(
      entry.color ?? Colors.Orange,
      title,
      lines.join("\n"),
      { footer: time(new Date(), TimestampStyles.ShortDateTime) },
    );

    await channel.send(card).catch(() => null);
  }
}
