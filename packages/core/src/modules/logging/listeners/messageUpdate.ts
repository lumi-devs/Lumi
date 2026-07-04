import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type Message, type PartialMessage } from "discord.js";
import { channelMention, userMention } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import { isIgnoredChannel, isToggleEnabled, sendLog } from "../lib/send.js";

@ApplyOptions<ModuleListener.Options>({
  name: "loggingMessageUpdate",
  event: Events.MessageUpdate,
  module: "logging",
})
export class LoggingMessageUpdateListener extends ModuleListener<
  typeof Events.MessageUpdate
> {
  protected async handle(
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage,
  ): Promise<void> {
    if (!newMessage.content || newMessage.author?.bot) return;
    // Embed unfurls and pin changes also fire MessageUpdate — only log real edits.
    if (oldMessage.content === newMessage.content) return;
    const guildId = newMessage.guildId!;
    if (!(await isToggleEnabled(guildId, "message_edits"))) return;
    if (await isIgnoredChannel(guildId, newMessage.channelId)) return;

    await sendLog(guildId, Colors.Orange, "Message Edited", [
      `**Author**: ${newMessage.author ? `${userMention(newMessage.author.id)} (${newMessage.author.id})` : "unknown (uncached message)"}`,
      `**Channel**: ${channelMention(newMessage.channelId)}`,
      `**Before**: ${oldMessage.content ? cutText(oldMessage.content, 450) : "*unknown (uncached message)*"}`,
      `**After**: ${cutText(newMessage.content, 450)}`,
      `[Jump to message](${newMessage.url})`,
    ]);
  }
}
