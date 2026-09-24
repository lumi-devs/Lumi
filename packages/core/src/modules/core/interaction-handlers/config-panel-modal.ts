import { fetchTyped } from "#lib/commands.js";
import { FieldType } from "#lib/module-system/config-schema.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { ConfigUtility } from "../utilities/ConfigUtility.js";
import { hasPanelAccess, loadDetail } from "../services/config-panel.js";
import { buildFeatureDetailView } from "#modules/core/ui/modules.js";
import { buildOverridesView } from "#modules/core/ui/overrides.js";
import { ephemeralCard, makeErrorCard } from "#lib/ui/cards.js";
import { cleanMention, isSnowflakeId } from "#lib/utilities/misc.js";
import {
  ConfigFieldModalId,
  ConfigModalId,
  ConfigOverrideModalId,
} from "../constants.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ModalSubmitInteraction } from "discord.js";
import { OverrideTargetType, type $Enums } from "@prisma/client";

function isOverrideTargetType(
  value: string,
): value is $Enums.OverrideTargetType {
  return (Object.values(OverrideTargetType) as string[]).includes(value);
}

@ApplyOptions<InteractionHandler.Options>({
  name: "config-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class ConfigPanelModalHandler extends InteractionHandler {
  private get cfg(): ConfigUtility {
    return getUtility("config");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    const fmodal = ConfigFieldModalId.parse(interaction.customId);
    if (fmodal) {
      return this.some({
        kind: "fmodal",
        moduleName: fmodal.moduleName,
        fieldKey: fmodal.fieldKey,
        fieldPage: fmodal.fieldPage,
      });
    }
    const modal = ConfigModalId.parse(interaction.customId);
    if (modal) {
      return this.some({
        kind: "modal",
        moduleName: modal.moduleName,
        fieldKey: undefined,
        fieldPage: undefined,
      });
    }
    const ovmodal = ConfigOverrideModalId.parse(interaction.customId);
    if (ovmodal) {
      return this.some({
        kind: "ovmodal",
        moduleName: ovmodal.moduleName,
        fieldKey: undefined,
        fieldPage: undefined,
      });
    }
    return this.none();
  }

  public async run(
    interaction: ModalSubmitInteraction,
    {
      kind,
      moduleName,
      fieldKey,
      fieldPage,
    }: {
      kind: string;
      moduleName: string;
      fieldKey?: string;
      fieldPage?: string;
    },
  ) {
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
    const record = this.container.moduleStore.getRecord(moduleName);
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
        return this.#err(
          interaction,
          `\`${fieldKey}\` is not a valid config key.`,
        );
      const raw = interaction.fields.getTextInputValue("value").trim();
      try {
        if (raw === "") {
          await this.container.db.config.deleteModuleConfigKey(
            guildId,
            moduleName,
            field.key,
          );
        } else {
          await this.cfg.setConfig(
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
        return this.#err(interaction, `\`${key}\` is not a valid config key.`);
      if (!isOverrideTargetType(type))
        return this.#err(
          interaction,
          "Target type must be one of: channel, role, user, category.",
        );
      const modelId = cleanMention(target);
      if (!isSnowflakeId(modelId))
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
      return interaction.editReply(buildOverridesView(record.meta, overrides));
    }

    const detail = await loadDetail(guildId, moduleName);
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
  }

  #err(interaction: ModalSubmitInteraction, message: string) {
    return interaction.followUp(
      ephemeralCard(makeErrorCard("Invalid Override", message)),
    );
  }
}
