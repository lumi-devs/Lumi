import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import { CommandContext } from "#lib/commands/context.js";
import { Emojis } from "#lib/utilities/assets.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import { isSnowflakeId } from "#lib/utilities/misc.js";

export const svDef: CommandDef = {
  name: "sv",
  description: "Bot owner server management",
  botOwner: true,
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("sv");
    return (
    b
            .setName("sv")
            .setDescription("Bot owner server management")
            .addSubcommand((s) =>
              s
                .setName("leave")
                .setDescription("Make the bot leave a server")
                .addStringOption((o) =>
                  o
                    .setName("guild_id")
                    .setDescription("Server ID to leave")
                    .setRequired(true),
                ),
            )
    );
  },
  handlers: {
  "leave": async (ctx: CommandContext) => {
    await ctx.defer();
    const raw = (await ctx.getString("guild_id", { required: true }))!;
    const guildId = raw.replace(/\D/g, "");
    if (!isSnowflakeId(guildId)) {
      await ctx.replyError(
        `${Emojis.Cross} Invalid Server ID`,
        `\`${raw}\` is not a valid server ID.`,
      );
      return;
    }

    const guild =
      ctx.services.client.guilds.cache.get(guildId) ??
      (await ctx.services.client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      await ctx.replyError(
        `${Emojis.Cross} Server Not Found`,
        `The bot is not in a server with ID \`${guildId}\`.`,
      );
      return;
    }

    const memberCount = guild.memberCount;
    const { confirmed } = await confirmPrompt(ctx, {
      title: `${Emojis.WarningSign} Leave Server`,
      body: `The bot will leave **${guild.name}** (\`${guild.id}\`, ${memberCount} members). This cannot be undone from here.`,
      confirmLabel: "Leave server",
      time: 30_000,
    });
    if (!confirmed) {
      await ctx.replyError("Cancelled", `Staying in **${guild.name}**.`);
      return;
    }

    const guildName = guild.name;
    try {
      await guild.leave();
    } catch {
      await ctx.replyError(
        `${Emojis.Cross} Leave Failed`,
        `Could not leave **${guildName}** (\`${guildId}\`).`,
      );
      return;
    }

    ctx.services.logger.info(
      `[Sv] ${Emojis.Wave} Left guild ${guildName} (${guildId}) on behalf of ${ctx.user.tag}`,
    );
    await ctx.services.db.ensureGuild(guildId);
    await ctx.services.db.audit
      .queueAuditLog({
        guildId,
        userId: ctx.user.id,
        action: "sv.leave",
        platform: "discord",
        details: { guildName, memberCount },
      })
      .catch((err: unknown) =>
        ctx.services.logger.warn("[Sv] Failed to queue leave audit entry:", err),
      );
    await ctx.replySuccess(
      `${Emojis.Wave} Left Server`,
      `Left **${guildName}** (\`${guildId}\`).`,
    );
  }
  }
};
