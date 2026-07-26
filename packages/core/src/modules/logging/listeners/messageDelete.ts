import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type Message, type PartialMessage } from "discord.js";
import { channelMention, userMention } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { isIgnoredChannel, isToggleEnabled, sendLog } from "../lib/send.js";
import { fetchT } from "#lib/commands.js";

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

    const t = await fetchT(message.channel);
    const lines = [
      `**${t("logging:author")}**: ${message.author ? `${userMention(message.author.id)} (${message.author.id})` : t("logging:unknownUncached")}`,
      `**${t("logging:channel")}**: ${channelMention(message.channelId)}`,
      `**${t("logging:content")}**: ${message.content ? cutText(message.content, 900) : `*${t("logging:unknownUncached")}*`}`,
    ];
    if (message.attachments?.size) {
      lines.push(`**${t("logging:attachments")}**: ${message.attachments.size}`);
    }
    await sendLog(guildId, Colors.Red, t("logging:messageDeleted"), lines);
  }
}
