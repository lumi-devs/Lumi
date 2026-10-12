import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import type { GuildMember } from "discord.js";
import { getLevelingConfig } from "#src/modules/leveling/Config.js";
import { LevelingModuleName } from "#src/modules/leveling/Constants.js";
import { LevelService } from "#src/modules/leveling/services/LevelService.js";

export const levelingGuildMemberAddListener = defineListener({
  name: "levelingGuildMemberAdd",
  event: Events.GuildMemberAdd,
  async execute(services: Container, member: GuildMember): Promise<void> {
    const guildId = member.guild.id;
    if (!(await services.db.modules.isModuleEnabled(guildId, LevelingModuleName)))
      return;
    const config = await getLevelingConfig(services, guildId);
    await new LevelService()
      .restoreEarnedRoles(member, config)
      .catch(() => null);
  },
});
