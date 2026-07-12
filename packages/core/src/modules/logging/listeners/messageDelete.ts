import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type Message, type PartialMessage } from "discord.js";
import { channelMention, userMention } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { isIgnoredChannel, isToggleEnabled, sendLog } from "../lib/send.js";

@ApplyOptions<ModuleListener.Options>({
  name: "loggingMessageDelete",
  event: Events.MessageDelete,
  module: "logging",
})
export class LoggingMessageDeleteListener extends ModuleListener<
  typeof Events.MessageDelete
> {
  protected async handle(message: Message | PartialMessage): Promise<void> {
    if (message.author?.bot) return;
    const guildId = message.guildId!;
    if (!(await isToggleEnabled(guildId, "message_deletes"))) return;
    if (await isIgnoredChannel(guildId, message.channelId)) return;

    const lines = [
      `**Author**: ${message.author ? `${userMention(message.author.id)} (${message.author.id})` : "unknown (uncached message)"}`,
      `**Channel**: ${channelMention(message.channelId)}`,
      `**Content**: ${message.content ? cutText(message.content, 900) : "*unknown (uncached message)*"}`,
    ];
    if (message.attachments?.size) {
      lines.push(`**Attachments**: ${message.attachments.size}`);
    }
    await sendLog(guildId, Colors.Red, "Message Deleted", lines);
  }
}
