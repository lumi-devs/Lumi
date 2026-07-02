import {
  InteractionHandlerTypes,
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  TextInputStyle,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { BaseInteractionHandler } from "#core/lib/interaction-handler.js";
import { Emojis } from "#utilities/assets.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { FieldType } from "#core/module-system/Module.js";
import type { ConfigService } from "#core/services/ConfigService.js";
import {
  buildFeatureDetailView,
  buildFeatureListView,
  buildHistoryView,
  buildOverridesView,
  hasPanelAccess,
  loadDetail,
  loadFeatures,
  type FeatureDetail,
} from "#core/lib/config-panel.js";

const OVERRIDE_TYPES = new Set(["channel", "role", "user", "category"]);

const accessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `${Emojis.CROSS} You need the Admin permission level to manage configuration.`,
  });


@ApplyOptions<InteractionHandler.Options>({
  name: "config-panel-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ConfigPanelButtonHandler extends BaseInteractionHandler {
  private get cfg(): ConfigService {
    return this.container.stores.get("services").get("config") as ConfigService;
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
    if (!(await hasPanelAccess(interaction))) throw accessDenied();
    const { guildId } = interaction;

    // Modal-opening actions must respond with showModal (no prior ack).
    if (action === "cfg")
      return this.#openConfigureModal(interaction, guildId, moduleName);
    if (action === "ovadd")
      return this.#openOverrideModal(interaction, guildId, moduleName);

    await this.acknowledge(interaction);

    switch (action) {
      case "back": {
        const features = await loadFeatures(guildId);
        return interaction.editReply(buildFeatureListView(features));
      }
      case "page": {
        const page = parseInt(moduleName, 10) || 0;
        const features = await loadFeatures(guildId);
        return interaction.editReply(buildFeatureListView(features, page));
      }
      case "open":
        return this.#renderDetail(interaction, guildId, moduleName);
      case "tog": {
        const detail = await this.#requireDetail(guildId, moduleName);
        await this.cfg.toggleGuildModule(
          guildId,
          moduleName,
          !detail.guildEnabled,
        );
        return this.#renderDetail(interaction, guildId, moduleName);
      }
      case "rst": {
        await this.container.db.config.clearModuleConfig(guildId, moduleName);
        return this.#renderDetail(interaction, guildId, moduleName);
      }
      case "bool": {
        const key = rest[0];
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
        return this.#renderDetail(interaction, guildId, moduleName);
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
  ) {
    const detail = await this.#requireDetail(guildId, moduleName);
    return interaction.editReply(
      buildFeatureDetailView(detail.meta, detail.config, detail.guildEnabled),
    );
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
      .filter((f) => f.type === FieldType.STRING || f.type === FieldType.NUMBER)
      .slice(0, 5);
    if (fields.length === 0) {
      return interaction.reply(
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

// ── Select menus ─────────────────────────────────────────────────────────

@ApplyOptions<InteractionHandler.Options>({
  name: "config-panel-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class ConfigPanelSelectHandler extends BaseInteractionHandler {
  private get cfg(): ConfigService {
    return this.container.stores.get("services").get("config") as ConfigService;
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (!interaction.customId.startsWith("cfg:")) return this.none();
    const [, action, moduleName, key] = interaction.customId.split(":");
    return this.some({ action, moduleName, key });
  }

  public async run(
    interaction: AnySelectMenuInteraction,
    {
      action,
      moduleName,
      key,
    }: { action: string; moduleName: string; key: string },
  ) {
    if (!interaction.inGuild()) return;
    if (!(await hasPanelAccess(interaction))) throw accessDenied();
    const { guildId } = interaction;
    await this.acknowledge(interaction);

    switch (action) {
      case "sel": {
        const selected = interaction.isStringSelectMenu()
          ? interaction.values[0]
          : undefined;
        if (!selected || selected === "_none") return;
        return this.#renderDetail(interaction, guildId, selected);
      }
      case "enum": {
        if (!interaction.isStringSelectMenu() || !key) return;
        const value = interaction.values[0];
        if (value !== undefined)
          await this.cfg.setConfig(
            guildId,
            moduleName,
            key,
            value,
            interaction.user.id,
          );
        return this.#renderDetail(interaction, guildId, moduleName);
      }
      case "ch":
      case "role":
      case "user": {
        if (!key) return;
        const id = interaction.values[0];
        if (id) {
          await this.cfg.setConfig(
            guildId,
            moduleName,
            key,
            id,
            interaction.user.id,
          );
        } else {
          await this.container.db.config.deleteModuleConfigKey(
            guildId,
            moduleName,
            key,
          );
        }
        return this.#renderDetail(interaction, guildId, moduleName);
      }
      case "rb": {
        if (!interaction.isStringSelectMenu()) return;
        const historyId = interaction.values[0];
        if (!historyId) return;
        const entry =
          await this.container.db.configHistory.getConfigHistoryEntry(
            historyId,
          );
        if (
          entry &&
          entry.guildId === guildId &&
          entry.oldValue !== null &&
          entry.oldValue !== undefined
        ) {
          await this.cfg.setConfig(
            guildId,
            entry.moduleName,
            entry.key,
            typeof entry.oldValue === "object"
              ? JSON.stringify(entry.oldValue)
              : String(entry.oldValue),
            interaction.user.id,
          );
        }
        const entries = await this.container.db.configHistory.getConfigHistory(
          guildId,
          moduleName,
        );
        const record = this.container.moduleStore.getRecord(moduleName);
        if (!record) return;
        return interaction.editReply(buildHistoryView(record.meta, entries));
      }
      case "ovrm": {
        if (!interaction.isStringSelectMenu()) return;
        const raw = interaction.values[0];
        if (!raw) return;
        const [modelType, modelId, ovKey] = raw.split("|");
        if (!modelType || !modelId || !ovKey) return;
        await this.container.db.configOverrides.deleteConfigOverride({
          guildId,
          moduleName,
          key: ovKey,
          modelType,
          modelId,
        });
        const overrides =
          await this.container.db.configOverrides.getConfigOverrides(
            guildId,
            moduleName,
          );
        const record = this.container.moduleStore.getRecord(moduleName);
        if (!record) return;
        return interaction.editReply(
          buildOverridesView(record.meta, overrides),
        );
      }
      default:
        return undefined;
    }
  }

  async #renderDetail(
    interaction: AnySelectMenuInteraction,
    guildId: string,
    moduleName: string,
  ) {
    const detail = await loadDetail(guildId, moduleName);
    if (!detail) return;
    return interaction.editReply(
      buildFeatureDetailView(detail.meta, detail.config, detail.guildEnabled),
    );
  }
}

// ── Modals ─────────────────────────────────────────────────────────────────

@ApplyOptions<InteractionHandler.Options>({
  name: "config-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class ConfigPanelModalHandler extends InteractionHandler {
  private get cfg(): ConfigService {
    return this.container.stores.get("services").get("config") as ConfigService;
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (
      !interaction.customId.startsWith("cfg:modal:") &&
      !interaction.customId.startsWith("cfg:ovmodal:")
    )
      return this.none();
    const [, kind, moduleName] = interaction.customId.split(":");
    return this.some({ kind, moduleName });
  }

  public async run(
    interaction: ModalSubmitInteraction,
    { kind, moduleName }: { kind: string; moduleName: string },
  ) {
    if (!interaction.inGuild() || !(await hasPanelAccess(interaction))) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Permission Denied",
            "You need the Admin permission level to manage configuration.",
          ),
        ),
      );
    }
    const { guildId } = interaction;
    const record = this.container.moduleStore.getRecord(moduleName);
    if (!record) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Unknown Module",
            `\`${moduleName}\` no longer exists.`,
          ),
        ),
      );
    }

    if (kind === "modal") {
      for (const f of record.meta.configFields ?? []) {
        if (f.type !== FieldType.STRING && f.type !== FieldType.NUMBER)
          continue;
        let raw: string;
        try {
          raw = interaction.fields.getTextInputValue(f.key).trim();
        } catch {
          continue;
        }
        try {
          if (raw === "") {
            await this.container.db.config.deleteModuleConfigKey(
              guildId,
              moduleName,
              f.key,
            );
          } else {
            await this.cfg.setConfig(
              guildId,
              moduleName,
              f.key,
              raw,
              interaction.user.id,
            );
          }
        } catch (err) {
          return interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Invalid Value",
                `**${f.label}**: ${err instanceof Error ? err.message : String(err)}`,
              ),
            ),
          );
        }
      }
    } else {
      // ovmodal — add a context override
      const key = interaction.fields.getTextInputValue("key").trim();
      const type = interaction.fields
        .getTextInputValue("type")
        .trim()
        .toLowerCase();
      const target = interaction.fields.getTextInputValue("target").trim();
      const value = interaction.fields.getTextInputValue("value").trim();

      const field = record.meta.configFields?.find((f) => f.key === key);
      if (!field)
        return this.#err(interaction, `\`${key}\` is not a valid config key.`);
      if (!OVERRIDE_TYPES.has(type))
        return this.#err(
          interaction,
          "Target type must be one of: channel, role, user, category.",
        );
      const modelId = target.replace(/[<@&#!>]/g, "");
      if (!/^\d{17,20}$/.test(modelId))
        return this.#err(
          interaction,
          "Provide a valid ID or mention as target.",
        );

      const coerced = this.cfg.coerce(value, field.type, field.choices);
      if (coerced === null)
        return this.#err(interaction, `Invalid value for \`${key}\`.`);

      await this.container.db.configOverrides.setConfigOverride({
        guildId,
        moduleName,
        key,
        modelType: type,
        modelId,
        value: coerced,
      });

      const overrides =
        await this.container.db.configOverrides.getConfigOverrides(
          guildId,
          moduleName,
        );
      if (interaction.isFromMessage())
        return interaction.update(buildOverridesView(record.meta, overrides));
      return interaction.reply(
        ephemeralCard(buildOverridesView(record.meta, overrides)),
      );
    }

    const detail = await loadDetail(guildId, moduleName);
    if (!detail) return;
    const view = buildFeatureDetailView(
      detail.meta,
      detail.config,
      detail.guildEnabled,
    );
    if (interaction.isFromMessage()) return interaction.update(view);
    return interaction.reply(ephemeralCard(view));
  }

  #err(interaction: ModalSubmitInteraction, message: string) {
    return interaction.reply(
      ephemeralCard(makeErrorCard("Invalid Override", message)),
    );
  }
}
