import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import type { Message } from "discord.js";
import { getLevelingConfig } from "#src/modules/leveling/Config.js";
import { LevelingModuleName } from "#src/modules/leveling/Constants.js";
import { LevelService } from "#src/modules/leveling/services/LevelService.js";

export const levelingMessageCreateListener = defineListener({
  name: "levelingMessageCreate",
  event: Events.MessageCreate,
  async execute(services: Container, message: Message): Promise<void> {
    if (message.partial) {
      const full = await message.fetch().catch(() => null);
      if (!full) return;
      message = full;
    }
    if (message.webhookId !== null) return;
    if (message.system) return;
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    const guildId = message.guildId;
    if (!(await services.db.modules.isModuleEnabled(guildId, LevelingModuleName)))
      return;
    const config = await getLevelingConfig(services, guildId);
    if (config.ignoredChannels.includes(message.channelId)) return;
    const member =
      message.member ??
      (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (member && member.user.bot) return;
    if (
      member &&
      config.ignoredRoles.some((roleId) => member.roles.cache.has(roleId))
    )
      return;
    const content = message.content.trim();
    if (content.length < config.minMessageLength && message.attachments.size === 0)
      return;
    const roleIds = member ? [...member.roles.cache.keys()] : [];
    await new LevelService()
      .grantMessage(guildId, message.author.id, roleIds, message.channelId, config, {
        announceChannel: message.channel.isTextBased() ? message.channel : null,
        member,
      })
      .catch(() => null);
  },
});

export default levelingMessageCreateListener;
