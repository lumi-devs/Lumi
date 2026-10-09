import { Events } from "discord.js";
import { Colors, roleMention, type GuildMember } from "discord.js";
import { userMention } from "@discordjs/formatters";
import type { Container } from "#lib/services.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import { isSuspiciousAccount } from "@lumi/application/services/security/suspicious.js";
import { loadVerificationConfig, assignPending } from "@lumi/application/services/security/verification.js";
import {
  loadJoinGateConfig,
  evaluateJoinFilters,
  applyGateAction,
  recordJoin,
  isRaidActive,
  isSuspiciousJoiner,
  recordRecentJoiner,
} from "@lumi/application/services/security/join-gate.js";

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

    // Every join counts toward the raid-burst window, even one the join gate
    // just kicked/banned - otherwise a raid whose joiners all trip the gate
    // never reaches the burst threshold that would activate raid mode.
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
      // Compare against joiners recorded *before* this one - checked first, tracked after.
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
