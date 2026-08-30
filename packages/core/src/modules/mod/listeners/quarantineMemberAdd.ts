import { Listener, container } from "@sapphire/framework";
import type { GuildMember } from "discord.js";
import { RedisKeys, RedisTTL } from "#database/redis.js";

export class QuarantineMemberAddListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "guildMemberAdd",
    });
  }

  public async run(member: GuildMember): Promise<void> {
    const guildId = member.guild.id;
    const userId = member.id;

    const quarantineState = await container.redis.get(
      RedisKeys.quarantineState(guildId, userId),
    );

    // "0" is a negative-cache sentinel written below when we confirm no active
    // quarantine. Skip the DB lookup entirely for the overwhelming majority of
    // joins that involve non-quarantined users.
    if (quarantineState === "0") return;

    let isQuarantined = Boolean(quarantineState);

    if (!isQuarantined) {
      const activeCases = await container.db.moderation.getActiveCases(
        guildId,
        userId,
        "quarantine",
      );
      if (activeCases.length > 0) {
        isQuarantined = true;
      } else {
        // Cache the negative result for 60 s. The quarantine-application path
        // writes a positive value that overwrites this, so there is no
        // window where a user could evade re-quarantine on rejoin.
        await container.redis.setex(
          RedisKeys.quarantineState(guildId, userId),
          RedisTTL.quarantineNegative,
          "0",
        );
      }
    }

    if (isQuarantined) {
      const roleId = (await container.db.config.getModuleConfig(
        guildId,
        "mod",
        "quarantine_role_id",
      )) as string | null;
      if (roleId) {
        await member.roles
          .set([roleId], "Re-enforcing active quarantine on rejoin")
          .catch(() => null);
        container.logger.info(
          `[quarantine] Re-enforced quarantine role for ${member.user.tag} on rejoin.`,
        );
      }
    }
  }
}

