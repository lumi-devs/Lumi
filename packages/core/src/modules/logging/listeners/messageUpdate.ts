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

export const LoggingMessageUpdateListener = defineListener({
  name: "loggingMessageUpdate",
  event: Events.MessageUpdate,
  module: "logging",
  async execute(
    services: Container,
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage,
  ): Promise<void> {
    if (!newMessage.guildId || !newMessage.content || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const guildId = newMessage.guildId;
    if (!(await isToggleEnabled(services, guildId, "message_edits"))) return;
    if (await isIgnoredChannel(services, guildId, newMessage.channelId)) return;

    await sendLog(services, guildId, "message_edits", Colors.Orange, "Message Edited", [
      `**Author**: ${newMessage.author ? `${userMention(newMessage.author.id)} (${newMessage.author.id})` : "unknown (uncached message)"}`,
      `**Channel**: ${channelMention(newMessage.channelId)}`,
      `**Before**: ${oldMessage.content ? escapeMarkdown(cutText(oldMessage.content, 450)) : "*unknown (uncached message)*"}`,
      `**After**: ${escapeMarkdown(cutText(newMessage.content, 450))}`,
      `[Jump to message](${newMessage.url})`,
    ]);
  },
});
