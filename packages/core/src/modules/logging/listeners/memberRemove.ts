import { Events } from "discord.js";
import type { Container } from "@lumi/lib/services.js";
import { Colors, type GuildMember, type PartialGuildMember } from "discord.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import { isToggleEnabled, sendLog } from "@lumi/application/services/logging/send.js";

export const LoggingMemberRemoveListener = defineListener({
  name: "loggingMemberRemove",
  event: Events.GuildMemberRemove,
  module: "logging",
  async execute(services: Container, member: GuildMember | PartialGuildMember): Promise<void> {
    if (!(await isToggleEnabled(services, member.guild.id, "member_leaves"))) return;

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
    await sendLog(services, member.guild.id, "member_leaves", Colors.Grey, "Member Left", lines);
  },
});
