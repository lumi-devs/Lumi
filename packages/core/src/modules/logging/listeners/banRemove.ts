import { Events } from "discord.js";
import type { Container } from "@lumi/lib/services.js";
import { Colors, type GuildBan } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import { isToggleEnabled, sendLog } from "@lumi/application/services/logging/send.js";

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
