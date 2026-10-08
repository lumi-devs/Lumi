import { Events } from "discord.js";
import type { Container } from "#lib/services.js";
import { Colors, type Message, type PartialMessage } from "discord.js";
import {
  channelMention,
  escapeMarkdown,
  userMention,
} from "@discordjs/formatters";
import { cutText } from "@lumi/shared";
import { defineListener } from "#lib/listeners/listener-def.js";
import { isIgnoredChannel, isToggleEnabled, sendLog } from "@lumi/application/services/logging/send.js";
import { fetchTyped } from "#lib/i18n/index.js";

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
