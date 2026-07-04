import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import {
  type ApplicationCommandRegistry,
  container,
} from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { type ChatInputCommandInteraction, type Message } from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
import { SUPPORTED_LANGUAGES } from "#core/i18n/index.js";
import { makeErrorCard, makeSuccessCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import type { GuildSettingsService } from "#core/services/GuildSettingsService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "language",
  description: "View or change the language Lumi uses in this server",
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "view", messageRun: "messageView", chatInputRun: "chatInputView" },
    { name: "set", messageRun: "messageSet", chatInputRun: "chatInputSet" },
    {
      name: "reset",
      messageRun: "messageReset",
      chatInputRun: "chatInputReset",
    },
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

  public async chatInputView(interaction: ChatInputCommandInteraction) {
    const t = await this.fetchT(interaction);
    const current = await container.db.config.getGuildSettings(
      interaction.guildId!,
    );
    return this.replySuccess(
      interaction,
      t("commands:languageCurrentTitle"),
      t("commands:languageCurrent", { language: current.locale }),
    );
  }

  public async chatInputSet(interaction: ChatInputCommandInteraction) {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const t = await this.fetchT(interaction);
    const language = interaction.options.getString("language", true);

    try {
      await this.settings.setLanguage(interaction.guildId!, language);
    } catch (err) {
      return this.replyError(
        interaction,
        t("commands:languageUnsupportedTitle"),
        (err as Error).message,
      );
    }

    // Re-resolve T so the confirmation is shown in the newly chosen language.
    const tNext = await this.fetchT(interaction);
    return this.replySuccess(
      interaction,
      `${Emojis.GEAR} ${tNext("commands:languageUpdatedTitle")}`,
      tNext("commands:languageUpdated", { language }),
    );
  }

  public async chatInputReset(interaction: ChatInputCommandInteraction) {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    try {
      await this.settings.resetLanguage(interaction.guildId!);
    } catch {
      // Already default — fall through to the (now-default-language) confirmation.
    }
    const t = await this.fetchT(interaction);
    const settings = await container.db.config.getGuildSettings(
      interaction.guildId!,
    );
    return this.replySuccess(
      interaction,
      `${Emojis.GEAR} ${t("commands:languageResetTitle")}`,
      t("commands:languageReset", { language: settings.locale }),
    );
  }

  public async messageView(message: Message) {
    const t = await this.fetchT(message);
    const current = await container.db.config.getGuildSettings(
      message.guildId!,
    );
    return message.reply(
      makeSuccessCard(
        t("commands:languageCurrentTitle"),
        t("commands:languageCurrent", { language: current.locale }),
      ),
    );
  }

  public async messageSet(message: Message) {
    if ((await resolvePermissionLevel(message)) < PermissionLevel.ADMIN) {
      const t = await this.fetchT(message);
      return message.reply(
        makeErrorCard(t("common:error"), t("preconditions:administrator")),
      );
    }
    const t = await this.fetchT(message);
    const language = message.content.trim().split(/\s+/).pop() ?? "";
    try {
      await this.settings.setLanguage(message.guildId!, language);
    } catch (err) {
      return message.reply(
        makeErrorCard(
          t("commands:languageUnsupportedTitle"),
          (err as Error).message,
        ),
      );
    }
    const tNext = await this.fetchT(message);
    return message.reply(
      makeSuccessCard(
        `${Emojis.GEAR} ${tNext("commands:languageUpdatedTitle")}`,
        tNext("commands:languageUpdated", { language }),
      ),
    );
  }

  public async messageReset(message: Message) {
    if ((await resolvePermissionLevel(message)) < PermissionLevel.ADMIN) {
      const t = await this.fetchT(message);
      return message.reply(
        makeErrorCard(t("common:error"), t("preconditions:administrator")),
      );
    }
    try {
      await this.settings.resetLanguage(message.guildId!);
    } catch {
      // Already default.
    }
    const t = await this.fetchT(message);
    const settings = await container.db.config.getGuildSettings(
      message.guildId!,
    );
    return message.reply(
      makeSuccessCard(
        `${Emojis.GEAR} ${t("commands:languageResetTitle")}`,
        t("commands:languageReset", { language: settings.locale }),
      ),
    );
  }
}
