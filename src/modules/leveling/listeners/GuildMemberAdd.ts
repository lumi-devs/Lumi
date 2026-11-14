import { Events } from "discord.js";
import { defineListener } from "@listeners/ListenerDef.js";
import type { Container } from "@lib/Services.js";
import type { GuildMember } from "discord.js";
import { getLevelingConfig } from "@modules/leveling/Config.js";
import { LevelingModuleName } from "@modules/leveling/Constants.js";
import { LevelService } from "@modules/leveling/services/LevelService.js";

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
