import { fetchTyped } from "#lib/i18n/index.js";
import type { LumiT } from "#lib/i18n/index.js";
import {
  acknowledge,
  defineInteraction,
} from "#lib/interactions/interaction-def.js";
import type { Container } from "#lib/services.js";
import { FieldType } from "#lib/module-system/config-schema.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { ConfigUtility } from "../../utilities/ConfigUtility.js";
import {
  configAccessDenied,
  hasPanelAccess,
  loadDetail,
} from "../../services/config-panel.js";
import { buildFeatureDetailView } from "#modules/core/ui/modules.js";
import {
  buildHistoryView,
  buildOverridesView,
} from "#modules/core/ui/overrides.js";
import { ConfigSelectId } from "../../constants.js";
import type { AnySelectMenuInteraction } from "discord.js";
import { OverrideTargetType, type $Enums } from "@prisma/client";

function isOverrideTargetType(
  value: string,
): value is $Enums.OverrideTargetType {
  return (Object.values(OverrideTargetType) as string[]).includes(value);
}

export const configPanelSelect = defineInteraction({
  prefix: ConfigSelectId.prefix,
  async run(services: Container, interaction: AnySelectMenuInteraction) {
    const parsed = ConfigSelectId.parse(interaction.customId);
    if (!parsed) return;
    const { action, moduleName, rest } = parsed;
    const [key, page] = rest;
    const cfg: ConfigUtility = getUtility("config");
    if (!interaction.inGuild()) return;
    await acknowledge(interaction);
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
        return renderDetail(services, interaction, guildId, selected, 0, t);
      }
      case "gsel": {
        if (!interaction.isStringSelectMenu()) return;
        const section = parseInt(interaction.values[0] ?? "0", 10) || 0;
        return renderDetail(services, interaction, guildId, moduleName, section, t);
      }
      case "enum": {
        if (!interaction.isStringSelectMenu() || !key) return;
        const value = interaction.values[0];
        if (value !== undefined)
          await cfg.setConfig(
            services,
            guildId,
            moduleName,
            key,
            value,
            interaction.user.id,
          );
        return renderDetail(
          services,
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
          const field = services.moduleStore
            .getRecord(moduleName)
            ?.meta.configFields?.find((f) => f.key === key);
          const multi =
            field?.type === FieldType.MultiRole ||
            field?.type === FieldType.MultiChannel ||
            field?.type === FieldType.MultiUser;
          await cfg.setConfig(
            services,
            guildId,
            moduleName,
            key,
            multi ? [...interaction.values] : interaction.values.join(","),
            interaction.user.id,
          );
        } else {
          await services.db.config.deleteModuleConfigKey(
            guildId,
            moduleName,
            key,
          );
        }
        return renderDetail(
          services,
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
        const parsedHistoryId = Number(historyId);
        if (!Number.isInteger(parsedHistoryId)) return;
        const entry =
          await services.db.configHistory.getConfigHistoryEntry(
            parsedHistoryId,
          );
        if (
          entry &&
          entry.guildId === guildId &&
          entry.oldValue !== null &&
          entry.oldValue !== undefined
        ) {
          await cfg.setConfig(
            services,
            guildId,
            entry.moduleName,
            entry.key,
            Array.isArray(entry.oldValue) ||
              typeof entry.oldValue === "string" ||
              typeof entry.oldValue === "number" ||
              typeof entry.oldValue === "boolean"
              ? entry.oldValue
              : JSON.stringify(entry.oldValue),
            interaction.user.id,
          );
        }
        const entries = await services.db.configHistory.getConfigHistory(
          guildId,
          moduleName,
        );
        const record = services.moduleStore.getRecord(moduleName);
        if (!record) return;
        return interaction.editReply(buildHistoryView(record.meta, entries));
      }
      case "ovrm": {
        if (!interaction.isStringSelectMenu()) return;
        const raw = interaction.values[0];
        if (!raw) return;
        const [modelType, modelId, ovKey] = raw.split("|");
        if (!modelType || !modelId || !ovKey) return;
        if (!isOverrideTargetType(modelType)) return;
        await services.db.configOverrides.deleteConfigOverride({
          guildId,
          moduleName,
          key: ovKey,
          modelType,
          modelId,
        });
        const overrides =
          await services.db.configOverrides.getConfigOverrides(
            guildId,
            moduleName,
          );
        const record = services.moduleStore.getRecord(moduleName);
        if (!record) return;
        return interaction.editReply(
          buildOverridesView(record.meta, overrides),
        );
      }
      default:
        return undefined;
    }
  },
});

async function renderDetail(
  services: Container,
    interaction: AnySelectMenuInteraction,
    guildId: string,
    moduleName: string,
    fieldPage = 0,
    t?: LumiT,
  ) {
    const detail = await loadDetail(services, guildId, moduleName);
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
