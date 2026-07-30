import { ApplyOptions } from "@sapphire/decorators";
import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { type ButtonInteraction, type StringSelectMenuInteraction } from "discord.js";
import { buildWarnThresholdsPanelView } from "../lib/warn-thresholds-panel.js";
import { logError } from "#lib/utilities/errors.js";
import {
  getThresholds,
  setThresholdRule,
  removeThresholdRule,
  saveThresholds,
  resetAllThresholds,
 
} from "../lib/thresholds.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class WarnThresholdsButtonHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("wt:")) return this.none();
    return this.some({ customId: interaction.customId });
  }

  public async run(
    interaction: ButtonInteraction,
    parsed: { customId: string },
  ): Promise<void> {
    const parts = parsed.customId.replace("wt:", "").split(":");
    const subAction = parts[0];
    const guildId = interaction.guildId!;

    let selectedCount = 3;
    let selectedAction = "mute";
    let selectedDuration = "1h";

    if (subAction === "save_rule") {
      const count = Number(parts[1] || 3);
      const action = (parts[2] || "mute");
      const duration = parts[3] || undefined;
      await setThresholdRule(container, guildId, count, action, duration);
      selectedCount = count;
      selectedAction = action;
      selectedDuration = duration ?? "";
    } else if (subAction === "remove_rule") {
      const count = Number(parts[1] || 3);
      await removeThresholdRule(container, guildId, count);
      selectedCount = count;
    } else if (subAction === "preset_standard") {
      await saveThresholds(container, guildId, {
        "3": { action: "mute", duration: "1h" },
        "5": { action: "kick" },
        "10": { action: "ban" },
      });
      selectedCount = 3;
      selectedAction = "mute";
      selectedDuration = "1h";
    } else if (subAction === "clear_all") {
      await resetAllThresholds(container, guildId);
      selectedCount = 3;
      selectedAction = "mute";
      selectedDuration = "1h";
    }

    const thresholds = await getThresholds(container, guildId);
    const decayRaw = await container.db.config.getModuleConfig(guildId, "mod", "warn_decay_days");
    const decayDays = typeof decayRaw === "number" ? decayRaw : 30;

    const view = buildWarnThresholdsPanelView(thresholds, decayDays, {
      selectedCount,
      selectedAction,
      selectedDuration,
    });

    const renderCtx = {
      sessionId: `wt:${guildId}:${interaction.user.id}`,
      guildId,
      userId: interaction.user.id,
      moduleStore: container.stores.get("modules") as any,
    };

    const rendered = await view.render(renderCtx);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(rendered);
      } else {
        await interaction.update(rendered as any);
      }
    } catch (err) {
      logError(`warnthresholds button error: customId=${parsed.customId}`, err);
    }
  }
}

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class WarnThresholdsSelectHandler extends InteractionHandler {
  public override parse(interaction: StringSelectMenuInteraction) {
    if (!interaction.customId.startsWith("wt:")) return this.none();
    return this.some({ customId: interaction.customId });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    parsed: { customId: string },
  ): Promise<void> {
    const parts = parsed.customId.replace("wt:", "").split(":");
    const subAction = parts[0];
    const val = interaction.values[0] ?? "";
    const guildId = interaction.guildId!;

    let selectedCount = Number(parts[1] || 3);
    let selectedAction = parts[2] || "mute";
    let selectedDuration = parts[3] || "1h";

    if (subAction === "select_count" || val.startsWith("count:")) {
      selectedCount = Number(val.replace("count:", ""));
    } else if (subAction === "select_action" || val.startsWith("action:")) {
      const actParts = val.replace("action:", "").split(":");
      selectedAction = actParts[0] ?? "mute";
      selectedDuration = actParts[1] ?? "";
    }

    const thresholds = await getThresholds(container, guildId);
    const decayRaw = await container.db.config.getModuleConfig(guildId, "mod", "warn_decay_days");
    const decayDays = typeof decayRaw === "number" ? decayRaw : 30;

    const view = buildWarnThresholdsPanelView(thresholds, decayDays, {
      selectedCount,
      selectedAction,
      selectedDuration,
    });

    const renderCtx = {
      sessionId: `wt:${guildId}:${interaction.user.id}`,
      guildId,
      userId: interaction.user.id,
      moduleStore: container.stores.get("modules") as any,
    };

    const rendered = await view.render(renderCtx);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(rendered);
      } else {
        await interaction.update(rendered as any);
      }
    } catch (err) {
      logError(`warnthresholds select error: customId=${parsed.customId}`, err);
    }
  }
}
