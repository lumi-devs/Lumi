import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type GuildBan } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import { isToggleEnabled, sendLog } from "../lib/send.js";

@ApplyOptions<ModuleListener.Options>({
  name: "loggingBanAdd",
  event: Events.GuildBanAdd,
  module: "logging",
})
export class LoggingBanAddListener extends ModuleListener<
  typeof Events.GuildBanAdd
> {
  protected async handle(ban: GuildBan): Promise<void> {
    if (!(await isToggleEnabled(ban.guild.id, "member_bans"))) return;

    const lines = [`**Member**: ${userMention(ban.user.id)} (${ban.user.id})`];
    if (ban.reason) lines.push(`**Reason**: ${ban.reason}`);
    await sendLog(ban.guild.id, Colors.DarkRed, "Member Banned", lines);
  }
}
