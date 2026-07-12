import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type GuildBan } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { isToggleEnabled, sendLog } from "../lib/send.js";

@ApplyOptions<ModuleListener.Options>({
  name: "loggingBanRemove",
  event: Events.GuildBanRemove,
  module: "logging",
})
export class LoggingBanRemoveListener extends ModuleListener<
  typeof Events.GuildBanRemove
> {
  protected async handle(ban: GuildBan): Promise<void> {
    if (!(await isToggleEnabled(ban.guild.id, "member_unbans"))) return;

    await sendLog(ban.guild.id, Colors.Green, "Member Unbanned", [
      `**Member**: ${userMention(ban.user.id)} (${ban.user.id})`,
    ]);
  }
}
