import { Events } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { Colors, type Message, type PartialMessage } from "discord.js";
import {
  channelMention,
  escapeMarkdown,
  userMention,
} from "@discordjs/formatters";
import { cutText } from "#src/shared/Index.ts";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { isIgnoredChannel, isToggleEnabled, sendLog } from "#src/modules/logging/services/Send.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";

export const LoggingMessageDeleteListener = defineListener({
  name: "loggingMessageDelete",
  event: Events.MessageDelete,
  module: "logging",
  async execute(services: Container, message: Message | PartialMessage): Promise<void> {
    if (!message.guildId || message.author?.bot) return;
    const guildId = message.guildId;
    if (!(await isToggleEnabled(services, guildId, "message_deletes"))) return;
    if (await isIgnoredChannel(services, guildId, message.channelId)) return;

    const t = await fetchTyped(message.channel, services);
    const lines = [
      `**${t("logging:author")}**: ${message.author ? `${userMention(message.author.id)} (${message.author.id})` : t("logging:unknownUncached")}`,
      `**${t("logging:channel")}**: ${channelMention(message.channelId)}`,
      `**${t("logging:content")}**: ${message.content ? escapeMarkdown(cutText(message.content, 900)) : `*${t("logging:unknownUncached")}*`}`,
    ];
    if (message.attachments?.size) {
      lines.push(`**${t("logging:attachments")}**: ${message.attachments.size}`);
    }
    await sendLog(services, guildId, "message_deletes", Colors.Red, t("logging:messageDeleted"), lines);
  },
});
