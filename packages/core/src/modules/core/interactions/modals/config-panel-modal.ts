import { fetchTyped } from "#lib/i18n/index.js";
import { FieldType } from "#lib/module-system/config-schema.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { ConfigUtility } from "../../utilities/ConfigUtility.js";
import { hasPanelAccess, loadDetail } from "../../services/config-panel.js";
import { buildFeatureDetailView } from "#modules/core/ui/modules.js";
import { buildOverridesView } from "#modules/core/ui/overrides.js";
import { ephemeralCard, makeErrorCard } from "#lib/ui/cards.js";
import { cleanMention, isSnowflakeId } from "#lib/utilities/misc.js";
import {
  ConfigFieldModalId,
  ConfigModalId,
  ConfigOverrideModalId,
} from "../../constants.js";
import { defineInteraction } from "#lib/interactions/interaction-def.js";
import type { Container } from "#lib/services.js";
import type { ModalSubmitInteraction } from "discord.js";
import { OverrideTargetType, type $Enums } from "@prisma/client";

function isOverrideTargetType(
  value: string,
): value is $Enums.OverrideTargetType {
  return (Object.values(OverrideTargetType) as string[]).includes(value);
}

export const configPanelModal = defineInteraction({
  prefix: [
    ConfigFieldModalId.prefix,
    ConfigModalId.prefix,
    ConfigOverrideModalId.prefix,
  ],
  async run(services: Container, interaction: ModalSubmitInteraction) {
    const fmodal = ConfigFieldModalId.parse(interaction.customId);
    const modal = fmodal ? null : ConfigModalId.parse(interaction.customId);
    const ovmodal =
      fmodal || modal
        ? null
        : ConfigOverrideModalId.parse(interaction.customId);
    if (!fmodal && !modal && !ovmodal) return;
    const kind = fmodal ? "fmodal" : modal ? "modal" : "ovmodal";
    const moduleName = (fmodal ?? modal ?? ovmodal)!.moduleName;
    const fieldKey = fmodal?.fieldKey;
    const fieldPage = fmodal?.fieldPage;
    const cfg: ConfigUtility = getUtility("config");
    if (!interaction.inGuild()) return;
    await interaction.deferUpdate();

    if (!(await hasPanelAccess(interaction))) {
      return interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Permission Denied",
            "You need the `admin.*` permit to manage configuration.",
          ),
        ),
      );
    }
    const { guildId } = interaction;
    const record = services.moduleStore.getRecord(moduleName);
    if (!record) {
      return interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Unknown Module",
            `\`${moduleName}\` no longer exists.`,
          ),
        ),
      );
    }

    if (kind === "fmodal") {
      const field = record.meta.configFields?.find((f) => f.key === fieldKey);
      if (!field)
        return err(
          interaction,
          `\`${fieldKey}\` is not a valid config key.`,
        );
      const raw = interaction.fields.getTextInputValue("value").trim();
      try {
        if (raw === "") {
          await services.db.config.deleteModuleConfigKey(
            guildId,
            moduleName,
            field.key,
          );
        } else {
          await cfg.setConfig(
            services,
            guildId,
            moduleName,
            field.key,
            raw,
            interaction.user.id,
          );
        }
      } catch (err) {
        return interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Invalid Value",
              `**${field.label}**: ${err instanceof Error ? err.message : String(err)}`,
            ),
          ),
        );
      }
    } else if (kind === "modal") {
      for (const f of record.meta.configFields ?? []) {
        if (
          f.type !== FieldType.String &&
          f.type !== FieldType.StringList &&
          f.type !== FieldType.Number &&
          f.type !== FieldType.Duration
        )
          continue;
        let raw: string;
        try {
          raw = interaction.fields.getTextInputValue(f.key).trim();
        } catch {
          continue;
        }
        try {
          if (raw === "") {
            await services.db.config.deleteModuleConfigKey(
              guildId,
              moduleName,
              f.key,
            );
          } else {
            await cfg.setConfig(
            services,
              guildId,
              moduleName,
              f.key,
              raw,
              interaction.user.id,
            );
          }
        } catch (err) {
          return interaction.followUp(
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
      const key = interaction.fields.getTextInputValue("key").trim();
      const type = interaction.fields
        .getTextInputValue("type")
        .trim()
        .toLowerCase();
      const target = interaction.fields.getTextInputValue("target").trim();
      const value = interaction.fields.getTextInputValue("value").trim();

      const field = record.meta.configFields?.find((f) => f.key === key);
      if (!field)
        return err(interaction, `\`${key}\` is not a valid config key.`);
      if (!isOverrideTargetType(type))
        return err(
          interaction,
          "Target type must be one of: channel, role, user, category.",
        );
      const modelId = cleanMention(target);
      if (!isSnowflakeId(modelId))
        return err(
          interaction,
          "Provide a valid ID or mention as target.",
        );

      const coerced = cfg.coerce(value, field.type, field.choices);
      if (coerced === null)
        return err(interaction, `Invalid value for \`${key}\`.`);

      await services.db.configOverrides.setConfigOverride({
        guildId,
        moduleName,
        key,
        modelType: type,
        modelId,
        value: coerced,
      });

      const overrides =
        await services.db.configOverrides.getConfigOverrides(
          guildId,
          moduleName,
        );
      return interaction.editReply(buildOverridesView(record.meta, overrides));
    }

    const detail = await loadDetail(services, guildId, moduleName);
    if (!detail) return;
    const t = await fetchTyped(interaction);
    const sectionIndex = parseInt(fieldPage ?? "0", 10) || 0;
    const view = buildFeatureDetailView(
      detail.meta,
      detail.config,
      detail.guildEnabled,
      sectionIndex,
      t,
    );
    return interaction.editReply(view);
  },
});

function err(interaction: ModalSubmitInteraction, message: string) {
  return interaction.followUp(
    ephemeralCard(makeErrorCard("Invalid Override", message)),
  );
}
