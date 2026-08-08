import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, roleMention, type GuildMember } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { tryGetService } from "#lib/module-system/Service.js";

@ApplyOptions<ModuleListener.Options>({
  name: "securityMemberJoin",
  event: Events.GuildMemberAdd,
  module: "security",
})
export class SecurityMemberJoinListener extends ModuleListener<
  typeof Events.GuildMemberAdd
> {
  protected async handle(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    const security = tryGetService("security");
    if (!security) return;

    const verification = await security.loadVerificationConfig(member.guild.id);
    if (verification.enabled) {
      await security.assignPending(member, verification);
    }

    const config = await security.loadJoinGateConfig(member.guild.id);
    if (!config.enabled) return;

    const filterResult = security.evaluateJoinFilters(member, config);
    if (filterResult) {
      await security.applyGateAction(
        member.guild,
        member.id,
        filterResult.action,
        `Join gate: ${filterResult.triggered.join(", ")}`,
      );
      if (filterResult.action !== "log") return;
    }

    const raidStarted = await security.recordJoin(member.guild.id, config);
    if (raidStarted) {
      this.container.logger.warn(
        `[security] Raid mode activated in ${member.guild.id}: ${config.raidJoinCount}+ joins in ${config.raidWindowSeconds}s`,
      );
      const logService = tryGetService("guild-log");
      const warnMentions = config.raidWarnRoleIds.map((id) => roleMention(id)).join(" ");
      await logService?.dispatch({
        guildId: member.guild.id,
        moduleName: "security",
        action: "🚨 Raid Mode Activated",
        targetId: member.id,
        actorId: this.container.client.user?.id ?? member.id,
        reason: `${config.raidJoinCount}+ joins within ${config.raidWindowSeconds}s - gating joiners (${config.raidAction}). Latest: ${userMention(member.id)}`,
        color: Colors.Red,
        extra: warnMentions ? { "Notify": warnMentions } : undefined,
      });
    }

    if (await security.isRaidActive(member.guild.id)) {
      // Compare against joiners recorded *before* this one - checked first, tracked after.
      const shouldGate =
        config.raidAccountType === "all" ||
        (await security.isSuspiciousJoiner(member, config));
      if (shouldGate) {
        await security.applyGateAction(
          member.guild,
          member.id,
          config.raidAction,
          "Join gate: raid mode active",
        );
      }
    }

    await security.recordRecentJoiner(member.guild.id, {
      username: member.user.username,
      createdTimestamp: member.user.createdTimestamp,
    });
  }
}
