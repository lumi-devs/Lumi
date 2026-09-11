import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { Emojis } from "#utilities/assets.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import { isSnowflakeId } from "#utilities/misc.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";

@ApplyOptions<BaseSubcommand.Options>({
  name: "sv",
  description: "Bot owner server management",
  preconditions: ["BotOwner"],
  prefixEnabled: true,
  subcommands: [{ name: "leave", run: "leaveGuild" }],
})
export class SvCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
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
        ),
    );
  }

  public async leaveGuild(ctx: CommandContext): Promise<void> {
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
      this.container.client.guilds.cache.get(guildId) ??
      (await this.container.client.guilds.fetch(guildId).catch(() => null));
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

    this.container.logger.info(
      `[Sv] ${Emojis.Wave} Left guild ${guildName} (${guildId}) on behalf of ${ctx.user.tag}`,
    );
    await this.container.db.ensureGuild(guildId);
    await this.container.db.audit
      .queueAuditLog({
        guildId,
        userId: ctx.user.id,
        action: "sv.leave",
        platform: "discord",
        details: { guildName, memberCount },
      })
      .catch((err: unknown) =>
        this.container.logger.warn("[Sv] Failed to queue leave audit entry:", err),
      );
    await ctx.replySuccess(
      `${Emojis.Wave} Left Server`,
      `Left **${guildName}** (\`${guildId}\`).`,
    );
  }
}
