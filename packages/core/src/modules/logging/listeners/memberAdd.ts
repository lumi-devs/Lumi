import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type GuildMember } from "discord.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import { isToggleEnabled, sendLog } from "../lib/send.js";

@ApplyOptions<ModuleListener.Options>({
  name: "loggingMemberAdd",
  event: Events.GuildMemberAdd,
  module: "logging",
})
export class LoggingMemberAddListener extends ModuleListener<
  typeof Events.GuildMemberAdd
> {
  protected async handle(member: GuildMember): Promise<void> {
    if (!(await isToggleEnabled(member.guild.id, "member_joins"))) return;

    await sendLog(member.guild.id, Colors.Green, "Member Joined", [
      `**Member**: ${userMention(member.id)} (${member.id})`,
      `**Account created**: ${time(member.user.createdAt, TimestampStyles.RelativeTime)}`,
      `**Member count**: ${member.guild.memberCount}`,
    ]);
  }
}
