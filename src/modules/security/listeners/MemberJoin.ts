import { Events } from "discord.js";
import { Colors, roleMention, type GuildMember } from "discord.js";
import { userMention } from "@discordjs/formatters";
import type { Container } from "#src/lib/Services.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { tryGetUtility } from "#src/lib/module-system/Utility.js";
import { isSuspiciousAccount } from "#src/modules/security/services/Suspicious.js";
import { loadVerificationConfig, assignPending } from "#src/modules/security/services/Verification.js";
import {
  loadJoinGateConfig,
  evaluateJoinFilters,
  applyGateAction,
  recordJoin,
  isRaidActive,
  isSuspiciousJoiner,
  recordRecentJoiner,
} from "#src/modules/security/services/JoinGate.js";

export const SecurityMemberJoinListener = defineListener({
  name: "securityMemberJoin",
  event: Events.GuildMemberAdd,
  module: "security",
  async execute(services: Container, member: GuildMember): Promise<void> {
    if (member.user.bot) return;

    const verification = await loadVerificationConfig(member.guild.id);
    if (
      verification.enabled &&
      (verification.target === "everyone" || isSuspiciousAccount(member.user))
    ) {
      await assignPending(member, verification);
    }

    const config = await loadJoinGateConfig(member.guild.id);
    if (!config.enabled) return;

    const filterResult = evaluateJoinFilters(member, config);
    let gated = false;
    if (filterResult) {
      await applyGateAction(
        member.guild,
        member.id,
        filterResult.action,
        `Join gate: ${filterResult.triggered.join(", ")}`,
      );
      gated = filterResult.action !== "log";
    }

    const raidStarted = await recordJoin(member.guild.id, config);
    if (raidStarted) {
      services.logger.warn(
        `[security] Raid mode activated in ${member.guild.id}: ${config.raidJoinCount}+ joins in ${config.raidWindowSeconds}s`,
      );
      const logService = tryGetUtility("guild-log");
      const warnMentions = config.raidWarnRoleIds.map((id) => roleMention(id)).join(" ");
      await logService?.dispatch(services, {
        guildId: member.guild.id,
        moduleName: "security",
        action: "🚨 Raid Mode Activated",
        targetId: member.id,
        actorId: services.client.user?.id ?? member.id,
        reason: `${config.raidJoinCount}+ joins within ${config.raidWindowSeconds}s - gating joiners (${config.raidAction}). Latest: ${userMention(member.id)}`,
        color: Colors.Red,
        extra: warnMentions ? { "Notify": warnMentions } : undefined,
      });
    }

    if (gated) return;

    if (await isRaidActive(member.guild.id)) {

      const shouldGate =
        config.raidAccountType === "all" ||
        (await isSuspiciousJoiner(member, config));
      if (shouldGate) {
        await applyGateAction(
          member.guild,
          member.id,
          config.raidAction,
          "Join gate: raid mode active",
        );
      }
    }

    await recordRecentJoiner(member.guild.id, {
      username: member.user.username,
      createdTimestamp: member.user.createdTimestamp,
    });
  },
});
