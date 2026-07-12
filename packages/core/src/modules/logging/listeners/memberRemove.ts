import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type GuildMember, type PartialGuildMember } from "discord.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { isToggleEnabled, sendLog } from "../lib/send.js";

@ApplyOptions<ModuleListener.Options>({
  name: "loggingMemberRemove",
  event: Events.GuildMemberRemove,
  module: "logging",
})
export class LoggingMemberRemoveListener extends ModuleListener<
  typeof Events.GuildMemberRemove
> {
  protected async handle(
    member: GuildMember | PartialGuildMember,
  ): Promise<void> {
    if (!(await isToggleEnabled(member.guild.id, "member_leaves"))) return;

    const lines = [
      `**Member**: ${userMention(member.id)} (${member.id})`,
      `**Member count**: ${member.guild.memberCount}`,
    ];
    if (member.joinedAt) {
      lines.splice(
        1,
        0,
        `**Joined**: ${time(member.joinedAt, TimestampStyles.RelativeTime)}`,
      );
    }
    await sendLog(member.guild.id, Colors.Grey, "Member Left", lines);
  }
}
