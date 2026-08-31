import { fetchTyped } from "#lib/commands.js";
import { FieldType } from "#lib/module-system/Module.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { ConfigUtility } from "#utilities/ConfigUtility.js";
import { hasPanelAccess, loadDetail } from "#modules/core/lib/config-panel.js";
import { buildFeatureDetailView } from "#modules/core/ui/modules.js";
import { buildOverridesView } from "#modules/core/ui/overrides.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { cleanMention } from "#utilities/misc.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ModalSubmitInteraction } from "discord.js";

const OVERRIDE_TYPES = new Set(["channel", "role", "user", "category"]);

@ApplyOptions<InteractionHandler.Options>({
  name: "config-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class ConfigPanelModalHandler extends InteractionHandler {
  private get cfg(): ConfigUtility {
    return getUtility("config");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (
      !interaction.customId.startsWith("cfg:modal:") &&
      !interaction.customId.startsWith("cfg:ovmodal:") &&
      !interaction.customId.startsWith("cfg:fmodal:")
    )
      return this.none();
    const [, kind, moduleName, fieldKey] = interaction.customId.split(":");
    return this.some({ kind, moduleName, fieldKey });
  }

  public async run(
    interaction: ModalSubmitInteraction,
    {
      kind,
      moduleName,
      fieldKey,
    }: { kind: string; moduleName: string; fieldKey?: string },
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
      if (!OVERRIDE_TYPES.has(type))
        return this.#err(
          interaction,
          "Target type must be one of: channel, role, user, category.",
        );
      const modelId = cleanMention(target);
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
      return interaction.editReply(buildOverridesView(record.meta, overrides));
    }

    const detail = await loadDetail(guildId, moduleName);
    if (!detail) return;
    const t = await fetchTyped(interaction);
    const view = buildFeatureDetailView(
      detail.meta,
      detail.config,
      detail.guildEnabled,
      0,
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
