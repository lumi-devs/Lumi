import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeSuccessCard, makeErrorCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { errorFrom } from "#utilities/errors.js";
import type { GuildSettingsService } from "#core/services/GuildSettingsService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "dashboard",
  description: "Manage dashboard configuration and layout",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.GUILD_OWNER,
  prefixEnabled: true,
  subcommands: [{ name: "layout", run: "layout" }],
})
export class DashboardCommand extends BaseSubcommand {
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
