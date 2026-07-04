import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import {
  type ApplicationCommandRegistry,
  container,
} from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { Emojis } from "#utilities/assets.js";
import type { GuildSettingsService } from "#core/services/GuildSettingsService.js";

const DEFAULT_PREFIX = ",";

@ApplyOptions<BaseSubcommand.Options>({
  name: "prefix",
  description: "View or change the command prefix for this server",
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "view", run: "view" },
    { name: "set", run: "set" },
    { name: "reset", run: "reset" },
  ],
})
export class PrefixCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      applyLocalizedBuilder(builder, "commands:prefix")
        .addSubcommand((sub) =>
          applyLocalizedBuilder(sub, "commands:prefixSet").addStringOption(
            (opt) =>
              applyLocalizedBuilder(opt, "commands:prefixOption").setRequired(
                true,
              ),
          ),
        )
        .addSubcommand((sub) =>
          applyLocalizedBuilder(sub, "commands:prefixReset"),
        )
        .addSubcommand((sub) =>
          applyLocalizedBuilder(sub, "commands:prefixView"),
        ),
    );
  }

  private get guildSettingsService(): GuildSettingsService {
    return getService("guild-settings");
  }

  public async view(ctx: CommandContext) {
    const t = await ctx.fetchT();
    const settings = await container.db.config.getGuildSettings(ctx.guildId!);
    return ctx.replySuccess(
      t("commands:prefixCurrentTitle"),
      t("commands:prefixCurrent", {
        prefix: settings.prefix ?? DEFAULT_PREFIX,
      }),
    );
  }

  public async set(ctx: CommandContext) {
    await ctx.checkPermission(PermissionLevel.ADMIN);
    const t = await ctx.fetchT();
    const newPrefix = (await ctx.getString("new_prefix", { required: true }))!;

    if (newPrefix.length > 5) {
      return ctx.replyError(
        t("commands:prefixTooLongTitle"),
        t("commands:prefixTooLong"),
      );
    }

    await this.guildSettingsService.setPrefix(ctx.guildId!, newPrefix);
    return ctx.replySuccess(
      `${Emojis.GEAR} ${t("commands:prefixUpdatedTitle")}`,
      t("commands:prefixUpdated", { prefix: newPrefix }),
    );
  }

  public async reset(ctx: CommandContext) {
    await ctx.checkPermission(PermissionLevel.ADMIN);
    const t = await ctx.fetchT();

    await this.guildSettingsService.resetPrefix(ctx.guildId!);
    return ctx.replySuccess(
      `${Emojis.GEAR} ${t("commands:prefixResetTitle")}`,
      t("commands:prefixReset"),
    );
  }
}
