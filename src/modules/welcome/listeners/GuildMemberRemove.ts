import { Events } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { loadWelcomeConfig, renderGoodbyeCard, sendWelcomeCard, templateVarsFor } from "#src/modules/welcome/services/Welcome.js";

export const WelcomeMemberRemoveListener = defineListener({
  name: "welcomeMemberRemove",
  event: Events.GuildMemberRemove,
  module: "welcome",
  async execute(_services: Container, member: GuildMember | PartialGuildMember): Promise<void> {
    if (member.user?.bot) return;
    const config = await loadWelcomeConfig(member.guild.id);
    if (!config.goodbyeEnabled || !config.goodbyeChannel) return;

    const vars = templateVarsFor(
      member.id,
      member.user?.username ?? "Someone",
      member.nickname,
      member.user?.displayAvatarURL() ?? "",
      member.guild.name,
      member.guild.id,
      member.guild.iconURL(),
      member.guild.memberCount,
    );
    await sendWelcomeCard(
      member.guild,
      config.goodbyeChannel,
      renderGoodbyeCard(config, vars),
      "Welcome: Goodbye send failed",
    );
  },
});
