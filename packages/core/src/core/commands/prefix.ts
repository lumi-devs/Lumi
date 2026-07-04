import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import {
  type ApplicationCommandRegistry,
  container,
  type Args,
} from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { type ChatInputCommandInteraction, type Message } from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
import { makeSuccessCard, makeErrorCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import type { GuildSettingsService } from "#core/services/GuildSettingsService.js";

const DEFAULT_PREFIX = ",";

@ApplyOptions<BaseSubcommand.Options>({
  name: "prefix",
  description: "View or change the command prefix for this server",
  preconditions: ["GuildOnly"],
  subcommands: [
    {
      name: "view",
      messageRun: "messageRunView",
      chatInputRun: "chatInputView",
    },
    { name: "set", messageRun: "messageRunSet", chatInputRun: "chatInputSet" },
    {
      name: "reset",
      messageRun: "messageRunReset",
      chatInputRun: "chatInputReset",
    },
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

  public async messageRunView(message: Message) {
    const t = await this.fetchT(message);
    const settings = await container.db.config.getGuildSettings(
      message.guildId!,
    );
    return message.reply(
      makeSuccessCard(
        t("commands:prefixCurrentTitle"),
        t("commands:prefixCurrent", {
          prefix: settings.prefix ?? DEFAULT_PREFIX,
        }),
      ),
    );
  }

  public async messageRunSet(message: Message, args: Args) {
    const t = await this.fetchT(message);
    if ((await resolvePermissionLevel(message)) < PermissionLevel.ADMIN) {
      return message.reply(
        makeErrorCard(t("common:error"), t("preconditions:administrator")),
      );
    }

    const newPrefix = await args.pick("string").catch(() => null);
    if (!newPrefix) {
      return message.reply(
        makeErrorCard(
          t("commands:prefixMissingTitle"),
          t("commands:prefixMissing", { usage: ",prefix set <new_prefix>" }),
        ),
      );
    }
    if (newPrefix.length > 5) {
      return message.reply(
        makeErrorCard(
          t("commands:prefixTooLongTitle"),
          t("commands:prefixTooLong"),
        ),
      );
    }

    await this.guildSettingsService.setPrefix(message.guildId!, newPrefix);
    return message.reply(
      makeSuccessCard(
        `${Emojis.GEAR} ${t("commands:prefixUpdatedTitle")}`,
        t("commands:prefixUpdated", { prefix: newPrefix }),
      ),
    );
  }

  public async messageRunReset(message: Message) {
    const t = await this.fetchT(message);
    if ((await resolvePermissionLevel(message)) < PermissionLevel.ADMIN) {
      return message.reply(
        makeErrorCard(t("common:error"), t("preconditions:administrator")),
      );
    }

    await this.guildSettingsService.resetPrefix(message.guildId!);
    return message.reply(
      makeSuccessCard(
        `${Emojis.GEAR} ${t("commands:prefixResetTitle")}`,
        t("commands:prefixReset"),
      ),
    );
  }

  public async chatInputView(interaction: ChatInputCommandInteraction) {
    const t = await this.fetchT(interaction);
    const settings = await container.db.config.getGuildSettings(
      interaction.guildId!,
    );
    return this.replySuccess(
      interaction,
      t("commands:prefixCurrentTitle"),
      t("commands:prefixCurrent", {
        prefix: settings.prefix ?? DEFAULT_PREFIX,
      }),
    );
  }

  public async chatInputSet(interaction: ChatInputCommandInteraction) {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const t = await this.fetchT(interaction);
    const newPrefix = interaction.options.getString("new_prefix", true);

    if (newPrefix.length > 5) {
      return this.replyError(
        interaction,
        t("commands:prefixTooLongTitle"),
        t("commands:prefixTooLong"),
      );
    }

    await this.guildSettingsService.setPrefix(interaction.guildId!, newPrefix);
    return this.replySuccess(
      interaction,
      `${Emojis.GEAR} ${t("commands:prefixUpdatedTitle")}`,
      t("commands:prefixUpdated", { prefix: newPrefix }),
    );
  }

  public async chatInputReset(interaction: ChatInputCommandInteraction) {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const t = await this.fetchT(interaction);

    await this.guildSettingsService.resetPrefix(interaction.guildId!);
    return this.replySuccess(
      interaction,
      `${Emojis.GEAR} ${t("commands:prefixResetTitle")}`,
      t("commands:prefixReset"),
    );
  }
}
