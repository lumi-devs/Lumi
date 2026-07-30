import { Listener, container } from "@sapphire/framework";
import type { GuildMember } from "discord.js";
import { RedisKeys } from "#database/redis.js";

export class QuarantineMemberAddListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: "guildMemberAdd",
    });
  }

  public async run(member: GuildMember): Promise<void> {
    const guildId = member.guild.id;
    const userId = member.id;

    // Check Redis or DB for active quarantine state
    const quarantineState = await container.redis.get(RedisKeys.quarantineState(guildId, userId));
    let isQuarantined = Boolean(quarantineState);

    if (!isQuarantined) {
      const activeCases = await container.db.moderation.getActiveCases(guildId, userId, "quarantine");
      if (activeCases.length > 0) {
        isQuarantined = true;
      }
    }

    if (isQuarantined) {
      const roleId = (await container.db.config.getModuleConfig(guildId, "mod", "quarantine_role_id")) as string | null;
      if (roleId) {
        await member.roles.set([roleId], "Re-enforcing active quarantine on rejoin").catch(() => null);
        container.logger.info(`[quarantine] Re-enforced quarantine role for ${member.user.tag} on rejoin.`);
      }
    }
  }
}
