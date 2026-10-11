import { Events } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { Colors, type GuildMember } from "discord.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { isToggleEnabled, sendLog } from "#src/modules/logging/services/Send.js";

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
