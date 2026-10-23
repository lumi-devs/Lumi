import { Events } from "discord.js";
import type { ListenerDef } from "@lumi/module-kit";
import { applyQuarantine, isQuarantined } from "../services/quarantine.ts";

/**
 * Redis survives a member leaving and rejoining, but the Discord role does
 * not. Re-apply the configured role so the visual state matches the permit
 * state.
 */
export const quarantineRejoinListener: ListenerDef<Events.GuildMemberAdd> = {
  name: "mod-quarantine-rejoin",
  event: Events.GuildMemberAdd,
  module: "mod",
  async execute(services, member) {
    if (member.user.bot) return;
    if (!(await services.modules.isEnabled(member.guild.id, "mod"))) return;
    if (!(await isQuarantined(services, member.guild.id, member.id))) return;
    await applyQuarantine(services, member, {
      moderatorId: "system",
      reason: "Rejoined while quarantined",
      reapply: true,
    }).catch((error: unknown) => {
      services.logger.warn(
        { error, guildId: member.guild.id, userId: member.id },
        "failed to re-apply quarantine on rejoin",
      );
    });
  },
};
