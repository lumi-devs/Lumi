import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
  container,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  GuildMember,
  TextInputStyle,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { getService } from "#core/module-system/Service.js";
import { BaseInteractionHandler } from "#core/lib/interaction-handler.js";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
import { Emojis } from "#utilities/assets.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { loadFeatures, buildFeatureListView } from "#core/lib/config-panel.js";
import {
  buildHubView,
  buildSettingsView,
  buildPermissionsView,
  buildAddonsView,
  DEFAULT_PREFIX,
} from "#core/lib/hub-panel.js";
import type { GuildSettingsService } from "#core/services/GuildSettingsService.js";

const accessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `${Emojis.CROSS} You need the Admin permission level to manage this server.`,
  });

/** Resolves the interacting member's permission level within this guild. */
async function resolveLevel(
  interaction:
    | ButtonInteraction
    | AnySelectMenuInteraction
    | ModalSubmitInteraction,
): Promise<PermissionLevel> {
  if (!interaction.guild) return PermissionLevel.USER;
  const member =
    interaction.member instanceof GuildMember ? interaction.member : null;
  return resolvePermissionLevel({
    userId: interaction.user.id,
    guild: interaction.guild,
    member,
  });
}

async function renderHub(interaction: ButtonInteraction) {
  const guildId = interaction.guildId!;
  const [features, settings] = await Promise.all([
    loadFeatures(guildId),
    container.db.config.getGuildSettings(guildId),
  ]);
  return interaction.editReply(
    buildHubView({
      moduleCount: features.length,
      enabledCount: features.filter((f) => f.guildEnabled).length,
      prefix: settings.prefix,
      locale: settings.locale,
    }),
  );
}

async function renderSettings(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
) {
  const settings = await container.db.config.getGuildSettings(
    interaction.guildId!,
  );
  return interaction.editReply(
    buildSettingsView({ prefix: settings.prefix, locale: settings.locale }),
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class HubPanelButtonHandler extends BaseInteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("lumi:")) return this.none();
    const [, action, sub] = interaction.customId.split(":");
    return this.some({ action, sub });
  }

  public async run(
    interaction: ButtonInteraction,
    { action, sub }: { action: string; sub?: string },
  ) {
    if (!interaction.inGuild()) return;
    const level = await resolveLevel(interaction);
    if (level < PermissionLevel.ADMIN) throw accessDenied();

    // Modal-opening actions must respond with showModal (no prior ack).
    if (action === "prefix" && sub === "set")
      return this.#openPrefixModal(interaction);

    await this.acknowledge(interaction);

    switch (action) {
      case "home":
        return renderHub(interaction);
      case "tab":
        return this.#renderTab(interaction, sub);
      case "prefix":
        if (sub === "reset") {
          await this.settings.resetPrefix(interaction.guildId).catch(() => {});
          return renderSettings(interaction);
        }
        return undefined;
      default:
        return undefined;
    }
  }

  async #renderTab(interaction: ButtonInteraction, tab: string | undefined) {
    switch (tab) {
      case "modules": {
        const features = await loadFeatures(interaction.guildId!);
        return interaction.editReply(buildFeatureListView(features));
      }
      case "permissions": {
        const overrides =
          await container.db.permissions.getAllPermissionOverrides(
            interaction.guildId!,
          );
        return interaction.editReply(buildPermissionsView(overrides));
      }
      case "settings":
        return renderSettings(interaction);
      case "addons":
        return interaction.editReply(buildAddonsView());
      default:
        return undefined;
    }
  }

  #openPrefixModal(interaction: ButtonInteraction) {
    const modal = new ModalBuilder()
      .setCustomId("lumi:prefixmodal")
      .setTitle("Set Command Prefix")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("prefix")
            .setLabel("New prefix")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(5)
            .setPlaceholder(`e.g. ${DEFAULT_PREFIX}`),
        ),
      );
    return interaction.showModal(modal);
  }
}

// ── Select menus ──────────────────────────────────────────────────────────────

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class HubPanelSelectHandler extends BaseInteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (interaction.customId !== "lumi:setlang") return this.none();
    return this.some();
  }

  public async run(interaction: AnySelectMenuInteraction) {
    if (!interaction.inGuild() || !interaction.isStringSelectMenu()) return;
    if ((await resolveLevel(interaction)) < PermissionLevel.ADMIN)
      throw accessDenied();
    await this.acknowledge(interaction);

    const language = interaction.values[0];
    if (language) {
      await this.settings
        .setLanguage(interaction.guildId, language)
        .catch(() => {});
    }
    return renderSettings(interaction);
  }
}

// ── Modals ────────────────────────────────────────────────────────────────────

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class HubPanelModalHandler extends InteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (interaction.customId !== "lumi:prefixmodal") return this.none();
    return this.some();
  }

  public async run(interaction: ModalSubmitInteraction) {
    if (!interaction.inGuild()) return;
    if ((await resolveLevel(interaction)) < PermissionLevel.ADMIN) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Permission Denied",
            "You need the Admin permission level to manage this server.",
          ),
        ),
      );
    }

    const prefix = interaction.fields.getTextInputValue("prefix").trim();
    try {
      await this.settings.setPrefix(interaction.guildId, prefix);
    } catch (err) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Prefix",
            err instanceof Error ? err.message : String(err),
          ),
        ),
      );
    }

    const settings = await container.db.config.getGuildSettings(
      interaction.guildId,
    );
    const view = buildSettingsView({
      prefix: settings.prefix,
      locale: settings.locale,
    });
    if (interaction.isFromMessage()) return interaction.update(view);
    return interaction.reply(ephemeralCard(view));
  }
}
