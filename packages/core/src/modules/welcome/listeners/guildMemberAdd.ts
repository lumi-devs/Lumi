import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember } from "discord.js";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { logError } from "#lib/utilities/errors.js";
import { loadWelcomeConfig } from "../lib/config.js";
import { sendWelcomeCard } from "../lib/send.js";
import {
  buildDmWelcomeCard,
  buildWelcomeCard,
  renderWelcomeTemplate,
  templateVarsFor,
} from "../lib/template.js";

@ApplyOptions<ModuleListener.Options>({
  name: "welcomeMemberAdd",
  event: Events.GuildMemberAdd,
  module: "welcome",
})
export class WelcomeMemberAddListener extends ModuleListener<
  typeof Events.GuildMemberAdd
> {
  protected async handle(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    const config = await loadWelcomeConfig(member.guild.id);
    const vars = templateVarsFor(
      member.id,
      member.user.username,
      member.nickname,
      member.guild.name,
      member.guild.memberCount,
    );

    if (config.welcomeEnabled && config.welcomeChannel) {
      const autoRoleLine =
        config.autoRoles.length > 0
          ? `Auto-role${config.autoRoles.length === 1 ? "" : "s"}: ${config.autoRoles.map((id) => `<@&${id}>`).join(" ")}`
          : undefined;
      await sendWelcomeCard(
        member.guild,
        config.welcomeChannel,
        buildWelcomeCard(
          renderWelcomeTemplate(config.welcomeTemplate, vars),
          autoRoleLine,
        ),
        "Welcome: Channel send failed",
      );
    }

    if (config.autoRoles.length > 0) {
      await member.roles
        .add(config.autoRoles, "Welcome auto-role on join")
        .catch((err: unknown) => logError("Welcome: Auto-role failed", err));
    }

    if (config.dmWelcomeEnabled) {
      await member
        .send(
          buildDmWelcomeCard(
            member.guild.name,
            renderWelcomeTemplate(config.dmWelcomeTemplate, vars),
          ),
        )
        .catch((err: unknown) => logError("Welcome: DM send failed", err));
    }
  }
}
