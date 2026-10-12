import { Events } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { Colors, type GuildMember, type PartialGuildMember } from "discord.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { isToggleEnabled, sendLog } from "#src/modules/logging/services/Send.js";

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
