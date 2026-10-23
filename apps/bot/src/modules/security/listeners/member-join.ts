import { Events } from "discord.js";
import type { ListenerDef } from "@lumi/bot-kit";
import { getSecurityConfig } from "../services/config.ts";
import { assignPending, isSuspiciousAccount } from "../services/verification.ts";

export const securityMemberJoinListener: ListenerDef<Events.GuildMemberAdd> = {
  name: "security-verification-join",
  event: Events.GuildMemberAdd,
  module: "security",
  async execute(services, member) {
    if (member.user.bot) return;
    const config = await getSecurityConfig(services, member.guild.id).catch(() => null);
    if (!config?.verification_enabled || !config.verified_role_id) return;

    if (config.verification_target === "suspicious" && !isSuspiciousAccount(member.user)) {
      return;
    }

    await assignPending(services, member, config).catch((error: unknown) => {
      services.logger.warn(
        { error, guildId: member.guild.id, userId: member.id },
        "failed to assign verification pending role",
      );
    });
  },
};
