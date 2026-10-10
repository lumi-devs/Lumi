import { Events } from "discord.js";
import type { Container } from "@lumi/lib/services.js";
import type { GuildMember } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import { logError } from "@lumi/lib/utilities/errors.js";
import { loadWelcomeConfig } from "@lumi/application/services/welcome/welcome.js";
import { sendWelcomeCard } from "@lumi/application/services/welcome/welcome.js";
import { buildDmWelcomeCard, renderWelcomeCard, renderWelcomeTemplate, templateVarsFor } from "@lumi/application/services/welcome/welcome.js";

export const WelcomeMemberAddListener = defineListener({
  name: "welcomeMemberAdd",
  event: Events.GuildMemberAdd,
  module: "welcome",
  async execute(_services: Container, member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    const config = await loadWelcomeConfig(member.guild.id);
    const vars = templateVarsFor(
      member.id,
      member.user.username,
      member.nickname,
      member.displayAvatarURL(),
      member.guild.name,
      member.guild.id,
      member.guild.iconURL(),
      member.guild.memberCount,
    );

    if (config.welcomeEnabled && config.welcomeChannel) {
      await sendWelcomeCard(
        member.guild,
        config.welcomeChannel,
        renderWelcomeCard(config, vars),
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
  },
});
