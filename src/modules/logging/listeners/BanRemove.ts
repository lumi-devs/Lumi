import { Events } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { Colors, type GuildBan } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { isToggleEnabled, sendLog } from "#src/modules/logging/services/Send.js";

export const LoggingBanRemoveListener = defineListener({
  name: "loggingBanRemove",
  event: Events.GuildBanRemove,
  module: "logging",
  async execute(services: Container, ban: GuildBan): Promise<void> {
    if (!(await isToggleEnabled(services, ban.guild.id, "member_unbans"))) return;

    await sendLog(services, ban.guild.id, "member_unbans", Colors.Green, "Member Unbanned", [
      `**Member**: ${userMention(ban.user.id)} (${ban.user.id})`,
    ]);
  },
});
