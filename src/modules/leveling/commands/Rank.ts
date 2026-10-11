import { SlashCommandBuilder } from "discord.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ButtonStyle } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { getLevelingConfig } from "#src/modules/leveling/Config.js";
import { LevelService } from "#src/modules/leveling/services/LevelService.js";
import { xpForLevel } from "#src/modules/leveling/services/Formulas.js";
import { renderRankCard } from "#src/modules/leveling/services/RankCard.js";

export const rankDef: CommandDef = {
  name: "rank",
  module: "leveling",
  description: "Show your rank card with level, XP, messages, and voice time.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    return new SlashCommandBuilder()
      .setName("rank")
      .setDescription("Show a rank card with level, XP, messages, and voice time.")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Whose rank card to show. Defaults to you.")
          .setRequired(false),
      ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getLevelingConfig(ctx.services, guildId);
    const target = (await ctx.getUser("user")) ?? ctx.user;
    const account = await ctx.services.db.leveling.findAccount(
      guildId,
      target.id,
    );
    if (!account) {
      await ctx.replyEmpty(
        "No Rank Yet",
        `${target.username} has no XP on this server yet.`,
        "Send messages or join voice to earn XP.",
      );
      return;
    }
    await ctx.defer({ ephemeral: false });
    try {
      const service = new LevelService();
      const rank = await service.rankOf(guildId, target.id);
      const needed = xpForLevel(config.formula, account.level);
      const accent = `#${(await ctx.brandColor()).toString(16).padStart(6, "0")}`;
      const buffer = await renderRankCard({
        username: target.username,
        avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
        level: account.level,
        xp: account.xp,
        xpNeeded: needed,
        rank,
        messageCount: account.messageCount,
        voiceMinutes: account.voiceMinutes,
        accent,
      });
      const attachment = new AttachmentBuilder(buffer, {
        name: `rank-${target.id}.png`,
        description: `${target.username} rank card`,
      });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("lvl:lb:overall:0")
          .setLabel("View Leaderboard")
          .setStyle(ButtonStyle.Secondary),
      );
      const payload = { files: [attachment], components: [row.toJSON()] };
      if (ctx.isSlash) {
        await ctx.interaction.editReply(payload);
      } else {
        await ctx.message.reply(payload);
      }
    } catch {
      await ctx.replyError(
        "Rank Failed",
        "I couldn't render that rank card. Try again in a moment.",
      );
    }
  },
};
