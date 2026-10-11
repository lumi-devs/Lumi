import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { getLevelingConfig } from "#src/modules/leveling/Config.js";
import { LevelingModuleName } from "#src/modules/leveling/Constants.js";

export const levelingGuildMemberRemoveListener = defineListener({
  name: "levelingGuildMemberRemove",
  event: Events.GuildMemberRemove,
  async execute(
    services: Container,
    member: GuildMember | PartialGuildMember,
  ): Promise<void> {
    const guildId = member.guild.id;
    if (!(await services.db.modules.isModuleEnabled(guildId, LevelingModuleName)))
      return;
    const config = await getLevelingConfig(services, guildId);
    if (config.keepXpOnLeave) return;
    await services.db.leveling
      .deleteAccount(guildId, member.id)
      .catch(() => null);
  },
});

export default levelingGuildMemberRemoveListener;
