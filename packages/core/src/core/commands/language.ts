import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import {
  type ApplicationCommandRegistry,
  container,
} from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { SUPPORTED_LANGUAGES } from "#core/i18n/index.js";
import { Emojis } from "#utilities/assets.js";
import type { GuildSettingsService } from "#core/services/GuildSettingsService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "language",
  description: "View or change the language Lumi uses in this server",
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "view", run: "view" },
    { name: "set", run: "set" },
    { name: "reset", run: "reset" },
  ],
})
export class LanguageCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      applyLocalizedBuilder(builder, "commands:language")
        .addSubcommand((sub) =>
          applyLocalizedBuilder(sub, "commands:languageView"),
        )
        .addSubcommand((sub) =>
          applyLocalizedBuilder(sub, "commands:languageSet").addStringOption(
            (opt) =>
              applyLocalizedBuilder(opt, "commands:languageOption")
                .setRequired(true)
                .setChoices(
                  ...SUPPORTED_LANGUAGES.map((lang) => ({
                    name: lang,
                    value: lang,
                  })),
                ),
          ),
        )
        .addSubcommand((sub) =>
          applyLocalizedBuilder(sub, "commands:languageReset"),
        ),
    );
  }

  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  public async view(ctx: CommandContext) {
    const t = await ctx.fetchT();
    const current = await container.db.config.getGuildSettings(ctx.guildId!);
    return ctx.replySuccess(
      t("commands:languageCurrentTitle"),
      t("commands:languageCurrent", { language: current.locale }),
    );
  }

  public async set(ctx: CommandContext) {
    await ctx.checkPermission(PermissionLevel.ADMIN);
    const t = await ctx.fetchT();
    const language = (await ctx.getString("language", { required: true }))!;

    try {
      await this.settings.setLanguage(ctx.guildId!, language);
    } catch (err) {
      return ctx.replyError(
        t("commands:languageUnsupportedTitle"),
        (err as Error).message,
      );
    }

    // Re-resolve T so the confirmation is shown in the newly chosen language.
    const tNext = await ctx.fetchT();
    return ctx.replySuccess(
      `${Emojis.GEAR} ${tNext("commands:languageUpdatedTitle")}`,
      tNext("commands:languageUpdated", { language }),
    );
  }

  public async reset(ctx: CommandContext) {
    await ctx.checkPermission(PermissionLevel.ADMIN);
    try {
      await this.settings.resetLanguage(ctx.guildId!);
    } catch {
      // Already default — fall through to the (now-default-language) confirmation.
    }
    const t = await ctx.fetchT();
    const settings = await container.db.config.getGuildSettings(ctx.guildId!);
    return ctx.replySuccess(
      `${Emojis.GEAR} ${t("commands:languageResetTitle")}`,
      t("commands:languageReset", { language: settings.locale }),
    );
  }
}
