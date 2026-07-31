import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type GuildMember } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { tryGetService } from "#lib/module-system/Service.js";

const HOUR_MS = 60 * 60 * 1000;

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

    if (config.minAccountAgeHours > 0) {
      const ageMs = Date.now() - member.user.createdTimestamp;
      if (ageMs < config.minAccountAgeHours * HOUR_MS) {
        await security.applyGateAction(
          member.guild,
          member.id,
          config.raidAction,
          `Join gate: account younger than ${config.minAccountAgeHours}h`,
        );
        return;
      }
    }

    const raidStarted = await security.recordJoin(member.guild.id, config);
    if (raidStarted) {
      this.container.logger.warn(
        `[security] Raid mode activated in ${member.guild.id}: ${config.raidJoinCount}+ joins in ${config.raidWindowSeconds}s`,
      );
      const logService = tryGetService("guild-log");
      await logService?.dispatch({
        guildId: member.guild.id,
        moduleName: "security",
        action: "🚨 Raid Mode Activated",
        targetId: member.id,
        actorId: this.container.client.user?.id ?? member.id,
        reason: `${config.raidJoinCount}+ joins within ${config.raidWindowSeconds}s - gating joiners (${config.raidAction}). Latest: ${userMention(member.id)}`,
        color: Colors.Red,
      });
    }

    if (await security.isRaidActive(member.guild.id)) {
      await security.applyGateAction(
        member.guild,
        member.id,
        config.raidAction,
        "Join gate: raid mode active",
      );
    }
  }
}
