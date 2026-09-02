import { ApplyOptions } from "@sapphire/decorators";
import { getUtility } from "#lib/module-system/Utility.js";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { Emojis } from "#lib/utilities/assets.js";
import { errorFrom } from "#lib/utilities/errors.js";
import type { GuildSettingsUtility } from "#utilities/GuildSettingsUtility.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "dashboard",
  description: "Manage dashboard configuration and layout",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.*",
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

  private get guildSettingsService(): GuildSettingsUtility {
    return getUtility("guild-settings");
  }

  public async layout(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
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
      await ctx.replySuccess(
        `${Emojis.GEAR} ${t("core:layoutUpdatedTitle")}`,
        t("core:layoutUpdatedMessage", { layout: JSON.stringify(layout) }),
      );
    } catch (err: unknown) {
      await ctx.replyError(
        t("core:failedUpdateLayoutTitle"),
        errorFrom(err).message,
      );
    }
  }
}
