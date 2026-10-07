import type { Container } from "#lib/services.js";
import type { GuildMember } from "discord.js";
import { ValkeyKeys, ValkeyTTL } from "#lib/database/valkey.js";
import { defineListener } from "#lib/listeners/listener-def.js";

export const QuarantineMemberAddListener = defineListener({
  name: "quarantineMemberAdd",
  event: "guildMemberAdd",
  async execute(services: Container, member: GuildMember): Promise<void> {
    const guildId = member.guild.id;
    const userId = member.id;

    const quarantineState = await services.valkey.get(
      ValkeyKeys.quarantineState(guildId, userId),
    );

    // "0" is a negative-cache sentinel written below when we confirm no active
    // quarantine. Skip the DB lookup entirely for the overwhelming majority of
    // joins that involve non-quarantined users.
    if (quarantineState === "0") return;

    let isQuarantined = Boolean(quarantineState);

    if (!isQuarantined) {
      const activeCases = await services.db.moderation.getActiveCases(
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
        await services.valkey.setex(
          ValkeyKeys.quarantineState(guildId, userId),
          ValkeyTTL.quarantineNegative,
          "0",
        );
      }
    }

    if (isQuarantined) {
      const roleId = (await services.db.config.getModuleConfig(
        guildId,
        "mod",
        "quarantine_role_id",
      )) as string | null;
      if (roleId) {
        await member.roles
          .set([roleId], "Re-enforcing active quarantine on rejoin")
          .catch(() => null);
        services.logger.info(
          `[quarantine] Re-enforced quarantine role for ${member.user.tag} on rejoin.`,
        );
      }
    }
  },
});
