import { fetchTyped } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { FieldType } from "#lib/module-system/Module.js";
import { getService } from "#lib/module-system/Service.js";
import type { ConfigService } from "#lib/services/ConfigService.js";
import {
  configAccessDenied,
  hasPanelAccess,
  loadDetail,
  loadFeatures,
  type FeatureDetail,
} from "#modules/core/lib/config-panel.js";
import {
  buildFeatureDetailView,
  buildFeatureListView,
  buildFieldEditView,
} from "#modules/core/ui/modules.js";
import {
  buildHistoryView,
  buildOverridesView,
} from "#modules/core/ui/overrides.js";
import { Emojis } from "#utilities/assets.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { respond } from "#utilities/command-response.js";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
} from "@sapphire/framework";
import { TextInputStyle, type ButtonInteraction } from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "config-panel-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ConfigPanelButtonHandler extends BaseInteractionHandler {
  private get cfg(): ConfigService {
    return getService("config");
  }

  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("cfg:")) return this.none();
    const [, action, moduleName, ...rest] = interaction.customId.split(":");
    return this.some({ action, moduleName, rest });
  }

  public async run(
    interaction: ButtonInteraction,
    {
      action,
      moduleName,
      rest,
    }: { action: string; moduleName: string; rest: string[] },
  ) {
    if (!interaction.inGuild()) return;

    // showModal() must be the interaction's first response, so modal-opening
    // actions can't defer first; every other action defers immediately to
    // beat Discord's 3s ack window before the permission/i18n lookups below.
    const opensModal =
      action === "cfg" || action === "ovadd" || action === "fedit";
    if (!opensModal) await this.acknowledge(interaction);

    if (!(await hasPanelAccess(interaction))) throw configAccessDenied();
    const { guildId } = interaction;

    if (action === "cfg")
      return this.#openConfigureModal(interaction, guildId, moduleName);
    if (action === "ovadd")
      return this.#openOverrideModal(interaction, guildId, moduleName);
    if (action === "fedit")
      return this.#openFieldModal(interaction, guildId, moduleName, rest[0]);

    const t = await fetchTyped(interaction);

    switch (action) {
      case "back": {
        const features = await loadFeatures(guildId);
        return interaction.editReply(buildFeatureListView(features, 0, t));
      }
      case "page": {
        const page = parseInt(rest[0] ?? moduleName, 10) || 0;
        const features = await loadFeatures(guildId);
        return interaction.editReply(buildFeatureListView(features, page, t));
      }
      case "open":
        return this.#renderDetail(interaction, guildId, moduleName, 0, t);
      case "field": {
        const key = rest[0];
        const fieldPage = parseInt(rest[1] ?? "0", 10) || 0;
        if (!key) return;
        const detail = await this.#requireDetail(guildId, moduleName);
        const field = detail.meta.configFields?.find((f) => f.key === key);
        if (!field) return;
        return interaction.editReply(
          buildFieldEditView(detail.meta, field, detail.config, fieldPage, t),
        );
      }
      case "fpage": {
        const page = parseInt(rest[1] ?? "0", 10) || 0;
        return this.#renderDetail(interaction, guildId, moduleName, page, t);
      }
      case "tog": {
        const detail = await this.#requireDetail(guildId, moduleName);
        await this.cfg.toggleGuildModule(
          guildId,
          moduleName,
          !detail.guildEnabled,
        );
        return this.#renderDetail(interaction, guildId, moduleName, 0, t);
      }
      case "rst": {
        await this.container.db.config.clearModuleConfig(guildId, moduleName);
        return this.#renderDetail(interaction, guildId, moduleName, 0, t);
      }
      case "bool": {
        const key = rest[0];
        const fieldPage = parseInt(rest[1] ?? "0", 10) || 0;
        if (!key) return;
        const detail = await this.#requireDetail(guildId, moduleName);
        const field = detail.meta.configFields?.find((f) => f.key === key);
        if (!field) return;
        const def =
          field.default === undefined ? false : Boolean(field.default);
        const current = Boolean(detail.config[key] ?? def);
        await this.cfg.setConfig(
          guildId,
          moduleName,
          key,
          String(!current),
          interaction.user.id,
        );
        return this.#renderDetail(
          interaction,
          guildId,
          moduleName,
          fieldPage,
          t,
        );
      }
      case "hist": {
        const detail = await this.#requireDetail(guildId, moduleName);
        const entries = await this.container.db.configHistory.getConfigHistory(
          guildId,
          moduleName,
        );
        return interaction.editReply(buildHistoryView(detail.meta, entries));
      }
      case "ovr": {
        const detail = await this.#requireDetail(guildId, moduleName);
        const overrides =
          await this.container.db.configOverrides.getConfigOverrides(
            guildId,
            moduleName,
          );
        return interaction.editReply(
          buildOverridesView(detail.meta, overrides),
        );
      }
      default:
        return undefined;
    }
  }

  async #renderDetail(
    interaction: ButtonInteraction,
    guildId: string,
    moduleName: string,
    fieldPage = 0,
    t?: LumiT,
  ) {
    const detail = await this.#requireDetail(guildId, moduleName);
    return interaction.editReply(
      buildFeatureDetailView(
        detail.meta,
        detail.config,
        detail.guildEnabled,
        fieldPage,
        t,
      ),
    );
  }

  async #openFieldModal(
    interaction: ButtonInteraction,
    guildId: string,
    moduleName: string,
    key: string | undefined,
  ) {
    if (!key) return;
    const detail = await this.#requireDetail(guildId, moduleName);
    const field = detail.meta.configFields?.find((f) => f.key === key);
    if (!field) return;

    const current = detail.config[field.key];
    const input = new TextInputBuilder()
      .setCustomId("value")
      .setLabel(field.label.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setRequired(Boolean(field.required));
    if (field.description)
      input.setPlaceholder(field.description.slice(0, 100));
    if (current !== null && current !== undefined)
      input.setValue(String(current).slice(0, 4000));

    const modal = new ModalBuilder()
      .setCustomId(`cfg:fmodal:${moduleName}:${field.key}`)
      .setTitle(field.label.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );

    return interaction.showModal(modal);
  }

  async #requireDetail(
    guildId: string,
    moduleName: string,
  ): Promise<FeatureDetail> {
    const detail = await loadDetail(guildId, moduleName);
    if (!detail)
      throw new UserError({
        identifier: "UnknownModule",
        message: `${Emojis.CROSS} Module \`${moduleName}\` no longer exists.`,
      });
    return detail;
  }

  async #openConfigureModal(
    interaction: ButtonInteraction,
    guildId: string,
    moduleName: string,
  ) {
    const detail = await this.#requireDetail(guildId, moduleName);
    const fields = (detail.meta.configFields ?? [])
      .filter(
        (f) =>
          (f.type === FieldType.STRING && !f.list) ||
          f.type === FieldType.NUMBER,
      )
      .slice(0, 5);
    if (fields.length === 0) {
      return respond(
        interaction,
        ephemeralCard(
          makeErrorCard(
            "Nothing to configure",
            "This feature has no text or number fields.",
          ),
        ),
      );
    }

    const modal = new ModalBuilder()
      .setCustomId(`cfg:modal:${moduleName}`)
      .setTitle(`Configure ${detail.meta.displayName}`.slice(0, 45));

    for (const f of fields) {
      const current = detail.config[f.key];
      const input = new TextInputBuilder()
        .setCustomId(f.key)
        .setLabel(f.label.slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setRequired(Boolean(f.required));
      if (f.description) input.setPlaceholder(f.description.slice(0, 100));
      if (current !== null && current !== undefined)
        input.setValue(String(current).slice(0, 4000));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );
    }

    return interaction.showModal(modal);
  }

  async #openOverrideModal(
    interaction: ButtonInteraction,
    guildId: string,
    moduleName: string,
  ) {
    const detail = await this.#requireDetail(guildId, moduleName);
    const modal = new ModalBuilder()
      .setCustomId(`cfg:ovmodal:${moduleName}`)
      .setTitle(`Override • ${detail.meta.displayName}`.slice(0, 45));

    const mk = (id: string, label: string, placeholder: string) =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder(placeholder.slice(0, 100)),
      );

    modal.addComponents(
      mk("key", "Config key", "e.g. log_channel_id"),
      mk("type", "Target type", "channel, role, user, or category"),
      mk("target", "Target ID or mention", "e.g. #general or 123…"),
      mk("value", "Override value", "Value to apply for this target"),
    );

    return interaction.showModal(modal);
  }
}
