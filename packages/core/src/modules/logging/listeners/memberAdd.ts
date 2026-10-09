import { Events } from "discord.js";
import type { Container } from "#lib/services.js";
import { Colors, type GuildMember } from "discord.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { defineListener } from "#lib/listeners/listener-def.js";
import { isToggleEnabled, sendLog } from "@lumi/application/services/logging/send.js";

export const LoggingMemberAddListener = defineListener({
  name: "loggingMemberAdd",
  event: Events.GuildMemberAdd,
  module: "logging",
  async execute(services: Container, member: GuildMember): Promise<void> {
    if (!(await isToggleEnabled(services, member.guild.id, "member_joins"))) return;

    await sendLog(services, member.guild.id, "member_joins", Colors.Green, "Member Joined", [
      `**Member**: ${userMention(member.id)} (${member.id})`,
      `**Account created**: ${time(member.user.createdAt, TimestampStyles.RelativeTime)}`,
      `**Member count**: ${member.guild.memberCount}`,
    ]);
  },
});
