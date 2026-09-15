import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { loadWelcomeConfig } from "#lib/utilities/welcome.js";
import { sendWelcomeCard } from "#lib/utilities/welcome.js";
import { renderGoodbyeCard, templateVarsFor } from "#lib/utilities/welcome.js";

@ApplyOptions<ModuleListener.Options>({
  name: "welcomeMemberRemove",
  event: Events.GuildMemberRemove,
  module: "welcome",
})
export class WelcomeMemberRemoveListener extends ModuleListener<
  typeof Events.GuildMemberRemove
> {
  protected async handle(
    member: GuildMember | PartialGuildMember,
  ): Promise<void> {
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
  }
}
