import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#lib/module-system/Service.js";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { makeSuccessCard, makeErrorCard } from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { errorFrom } from "#lib/utilities/errors.js";
import type { GuildSettingsService } from "#lib/services/GuildSettingsService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "dashboard",
  description: "Manage dashboard configuration and layout",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.GUILD_OWNER,
  prefixEnabled: true,
  subcommands: [{ name: "layout", run: "layout" }],
})
export class DashboardCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("layout")
            .setDescription("Set dashboard layout configuration")
            .addStringOption((o) =>
              o
                .setName("layout")
                .setDescription("Layout string or JSON")
                .setRequired(true),
            ),
        ),
    );
  }

  private get guildSettingsService(): GuildSettingsService {
    return getService("guild-settings");
  }

  public async layout(ctx: CommandContext): Promise<void> {
    const rawLayout = (await ctx.getString("layout", {
      rest: true,
      required: true,
    }))!;

    try {
      const layout = await this.guildSettingsService.setDashboardLayout(
        ctx.guildId!,
        rawLayout,
      );
      this.container.logger.info(
        `[Dashboard] ${Emojis.GEAR} Layout updated for guild ${ctx.guildId} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.GEAR} Layout Updated`,
          `Dashboard layout updated successfully to: \`${JSON.stringify(layout)}\``,
        ),
      );
    } catch (err: unknown) {
      await ctx.reply(
        makeErrorCard("Failed to Update Layout", errorFrom(err).message),
      );
    }
  }
}
