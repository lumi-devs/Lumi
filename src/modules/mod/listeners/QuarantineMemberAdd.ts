import type { Container } from "#src/lib/Services.js";
import type { GuildMember } from "discord.js";
import { ValkeyKeys, ValkeyTTL } from "#src/lib/valkey/Client.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";

export const QuarantineMemberAddListener = defineListener({
  name: "quarantineMemberAdd",
  event: "guildMemberAdd",
  async execute(services: Container, member: GuildMember): Promise<void> {
    const guildId = member.guild.id;
    const userId = member.id;

    const quarantineState = await services.valkey.get(
      ValkeyKeys.quarantineState(guildId, userId),
    );

    if (quarantineState === "0") return;

    if (!quarantineState) {
      const activeCases = await services.db.moderation.getActiveCases(
        guildId,
        userId,
        "quarantine",
      );
      if (activeCases.length === 0) {
        await services.valkey.setex(
          ValkeyKeys.quarantineState(guildId, userId),
          ValkeyTTL.quarantineNegative,
          "0",
        );
        return;
      }
    }

    const roleId = (await services.db.config.getModuleConfig(
      guildId,
      "mod",
      "quarantine_role_id",
    )) as string | null;
    if (!roleId) return;
    await member.roles
      .set([roleId], "Re-enforcing active quarantine on rejoin")
      .catch(() => null);
    services.logger.info(
      `[quarantine] Re-enforced quarantine role for ${member.user.tag} on rejoin.`,
    );
  },
});
