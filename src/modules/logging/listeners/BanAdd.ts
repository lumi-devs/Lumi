import { Events } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { Colors, type GuildBan } from "discord.js";
import { escapeMarkdown, userMention } from "@discordjs/formatters";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { isToggleEnabled, sendLog } from "#src/modules/logging/services/Send.js";

export const LoggingBanAddListener = defineListener({
  name: "loggingBanAdd",
  event: Events.GuildBanAdd,
  module: "logging",
  async execute(services: Container, ban: GuildBan): Promise<void> {
    if (!(await isToggleEnabled(services, ban.guild.id, "member_bans"))) return;

    const lines = [`**Member**: ${userMention(ban.user.id)} (${ban.user.id})`];
    if (ban.reason) lines.push(`**Reason**: ${escapeMarkdown(ban.reason)}`);
    await sendLog(services, ban.guild.id, "member_bans", Colors.DarkRed, "Member Banned", lines);
  },
});
