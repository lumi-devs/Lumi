import { fetchTyped } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { ConfigUtility } from "#utilities/ConfigUtility.js";
import {
  configAccessDenied,
  hasPanelAccess,
  loadDetail,
} from "#modules/core/lib/config-panel.js";
import { buildFeatureDetailView } from "#modules/core/ui/modules.js";
import {
  buildHistoryView,
  buildOverridesView,
} from "#modules/core/ui/overrides.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { AnySelectMenuInteraction } from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "config-panel-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class ConfigPanelSelectHandler extends BaseInteractionHandler {
  private get cfg(): ConfigUtility {
    return getUtility("config");
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (!interaction.customId.startsWith("cfg:")) return this.none();
    const [, action, moduleName, key, page] = interaction.customId.split(":");
    return this.some({ action, moduleName, key, page });
  }

  public async run(
    interaction: AnySelectMenuInteraction,
    {
      action,
      moduleName,
      key,
      page,
    }: { action: string; moduleName: string; key: string; page?: string },
  ) {
    if (!interaction.inGuild()) return;
    await this.acknowledge(interaction);
    if (!(await hasPanelAccess(interaction))) throw configAccessDenied();
    const { guildId } = interaction;
    const t = await fetchTyped(interaction);
    const fieldPage = parseInt(page ?? "0", 10) || 0;

    switch (action) {
      case "sel": {
        const selected = interaction.isStringSelectMenu()
          ? interaction.values[0]
          : undefined;
        if (!selected || selected === "_none") return;
        return this.#renderDetail(interaction, guildId, selected, 0, t);
      }
      case "gsel": {
        if (!interaction.isStringSelectMenu()) return;
        const section = parseInt(interaction.values[0] ?? "0", 10) || 0;
        return this.#renderDetail(interaction, guildId, moduleName, section, t);
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
        return this.#renderDetail(
          interaction,
          guildId,
          moduleName,
          fieldPage,
          t,
        );
      }
      case "ch":
      case "role":
      case "user": {
        if (!key) return;
        if (interaction.values.length > 0) {
          const valStr = interaction.values.join(",");
          await this.cfg.setConfig(
            guildId,
            moduleName,
            key,
            valStr,
            interaction.user.id,
          );
        } else {
          await this.container.db.config.deleteModuleConfigKey(
            guildId,
            moduleName,
            key,
          );
        }
        return this.#renderDetail(
          interaction,
          guildId,
          moduleName,
          fieldPage,
          t,
        );
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
    fieldPage = 0,
    t?: LumiT,
  ) {
    const detail = await loadDetail(guildId, moduleName);
    if (!detail) return;
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
}
