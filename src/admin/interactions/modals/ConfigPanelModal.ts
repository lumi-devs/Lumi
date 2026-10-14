import { fetchTyped } from "#src/lib/i18n/Index.js";
import { FieldType } from "#src/lib/module-system/ConfigSchema.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { ConfigUtility } from "#src/admin/utilities/ConfigUtility.js";
import { hasPanelAccess, loadDetail } from "#src/admin/services/ConfigPanel.js";
import { buildFeatureDetailView } from "#src/admin/ui/Modules.js";
import { buildOverridesView } from "#src/admin/ui/Overrides.js";
import { ephemeralCard, makeErrorCard } from "#src/lib/ui/Cards.js";
import { cleanMention, isSnowflakeId } from "#src/lib/utilities/Snowflakes.js";
import {
  ConfigFieldModalId,
  ConfigModalId,
  ConfigOverrideModalId,
} from "#src/lib/interactions/Ids.js";
import { defineInteraction } from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
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
    const modal = ConfigModalId.parse(interaction.customId);
    const ovmodal = ConfigOverrideModalId.parse(interaction.customId);
    let kind: "fmodal" | "modal" | "ovmodal";
    let moduleName: string;
    let fieldKey: string | undefined;
    let fieldPage: string | undefined;
    if (fmodal) {
      kind = "fmodal";
      moduleName = fmodal.moduleName;
      fieldKey = fmodal.fieldKey;
      fieldPage = fmodal.fieldPage;
    } else if (modal) {
      kind = "modal";
      moduleName = modal.moduleName;
    } else if (ovmodal) {
      kind = "ovmodal";
      moduleName = ovmodal.moduleName;
    } else {
      return;
    }
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
