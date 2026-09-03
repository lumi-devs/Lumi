import { badge, makeInfoCard, type CardReply } from "#lib/utilities/cards.js";
import { updatePanel } from "#lib/utilities/command-response.js";
import { ActionRowBuilder, StringSelectMenuOptionBuilder, type MessageActionRowComponentBuilder } from "@discordjs/builders";
import { createActionButton, createStringSelectMenu, buildSafeActionRows } from "#lib/utilities/panels.js";
import { container } from "@sapphire/framework";
import {
  ButtonStyle,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { getThresholds } from "./thresholds.js";

export interface WarnThresholds {
  [count: string]: {
    action: string;
    duration?: string;
  };
}

const ACTION_EMOJI: Record<string, string> = {
  mute: "🔇",
  kick: "👢",
  ban: "🔨",
  quarantine: "☣️",
  vcmute: "🎙️",
};

export interface WarnThresholdsPanelOptions {
  selectedCount?: number;
  selectedAction?: string;
  selectedDuration?: string;
}

export function buildWarnThresholdsPanel(
  thresholds: WarnThresholds,
  decayDays: number = 30,
  options: WarnThresholdsPanelOptions = {},
): CardReply {
  const selectedCount = options.selectedCount ?? 3;
  const selectedAction = options.selectedAction ?? "mute";
  const selectedDuration = options.selectedDuration ?? "1h";

  const entries = Object.entries(thresholds).sort(
    ([a], [b]) => Number(a) - Number(b),
  );
  const ruleBadges =
    entries.length > 0
      ? entries
          .map(([cnt, entry]) => {
            const actionEmoji = ACTION_EMOJI[entry.action] ?? "🛡️";
            const dur = entry.duration ? ` (${entry.duration})` : "";
            const badgeColor =
              entry.action === "ban"
                ? "red"
                : entry.action === "kick"
                  ? "purple"
                  : entry.action === "quarantine"
                    ? "yellow"
                    : "blue";
            return `• **${cnt} Warn${Number(cnt) === 1 ? "" : "s"}** ➔ ${badge(
              entry.action.toUpperCase(),
              badgeColor,
            )} ${actionEmoji}${dur}`;
          })
          .join("\n")
      : "-# *No active threshold escalation rules configured.*";

  const currentRuleForSelected = thresholds[String(selectedCount)];
  const currentRuleDesc = currentRuleForSelected
    ? `\`${currentRuleForSelected.action.toUpperCase()}\`${
        currentRuleForSelected.duration
          ? ` (${currentRuleForSelected.duration})`
          : ""
      }`
    : "`NONE`";

  const bodyText = [
    "Configure dynamic automated moderation actions when members reach warning thresholds.",
    "",
    "### Active Escalation Rules",
    ruleBadges,
    "",
    "### ⚙️ Rule Builder State",
    `• **Target Count:** \`${selectedCount} Warn${selectedCount === 1 ? "" : "s"}\``,
    `• **Selected Action:** \`${selectedAction.toUpperCase()}\`${selectedDuration ? ` (${selectedDuration})` : ""}`,
    `• **Saved Rule for ${selectedCount} Warns:** ${currentRuleDesc}`,
    "",
    `**Decay Schedule:** ${badge(`${decayDays} Days`, "green")} -# *(Warning points decay automatically)*`,
  ].join("\n");

  const countSelectOptions: StringSelectMenuOptionBuilder[] = [];
  for (let i = 1; i <= 10; i++) {
    countSelectOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${i} Warn${i === 1 ? "" : "s"}`)
        .setValue(`count:${i}`)
        .setDescription(
          `Set action when a user reaches ${i} warning point${i === 1 ? "" : "s"}`,
        )
        .setDefault(i === selectedCount),
    );
  }

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    createStringSelectMenu({
      customId: `wt:select_count:${selectedCount}:${selectedAction}:${selectedDuration}`,
      placeholder: `⚡ Select Warn Count Threshold (1 to 10)... Currently [${selectedCount}]`,
      options: countSelectOptions
    })
  );

  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    createStringSelectMenu({
      customId: `wt:select_action:${selectedCount}:${selectedAction}:${selectedDuration}`,
      placeholder: "🛡️ Select Punishment Action & Duration...",
      options: [
        { label: "🔇 Mute - 1 Hour", value: "action:mute:1h", description: "Timeout member for 1 Hour" },
        { label: "🔇 Mute - 24 Hours", value: "action:mute:24h", description: "Timeout member for 24 Hours" },
        { label: "🔇 Mute - 7 Days", value: "action:mute:7d", description: "Timeout member for 7 Days" },
        { label: "👢 Kick Member", value: "action:kick", description: "Kick member from server" },
        { label: "🔨 Ban Member (Permanent)", value: "action:ban", description: "Permanently ban member" },
        { label: "☣️ Quarantine Member", value: "action:quarantine", description: "Apply Anti-Nuke Quarantine role" },
        { label: "🎙️ Voice Mute - 1 Hour", value: "action:vcmute:1h", description: "Server-mute in voice for 1 Hour" },
        { label: "🎙️ Voice Mute - 24 Hours", value: "action:vcmute:24h", description: "Server-mute in voice for 24 Hours" },
      ]
    })
  );

  const row3 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    createActionButton({
      customId: `wt:save_rule:${selectedCount}:${selectedAction}:${selectedDuration}`,
      label: `➕ Save Rule for ${selectedCount} Warns`,
      style: ButtonStyle.Success
    }),
    createActionButton({
      customId: `wt:remove_rule:${selectedCount}`,
      label: `🗑️ Remove ${selectedCount} Warns Rule`,
      style: ButtonStyle.Danger,
      disabled: !currentRuleForSelected
    }),
    createActionButton({
      customId: "wt:preset_standard",
      label: "⚡ Apply 3-5-10 Preset",
      style: ButtonStyle.Primary
    }),
    createActionButton({
      customId: "wt:clear_all",
      label: "🧹 Reset All",
      style: ButtonStyle.Secondary,
      disabled: entries.length === 0
    })
  );

  return makeInfoCard("⚡ Warning Threshold Control Center", bodyText, {
    breadcrumbs: ["Moderation", "Warn Thresholds"],
    actionRows: buildSafeActionRows([row1, row2, row3]),
  });
}

// Re-reads thresholds and the decay window and repaints in place, so a
// component handler only has to say which rule stays selected.
export async function updateWarnThresholdsPanel(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  selection: WarnThresholdsPanelOptions,
): Promise<void> {
  const guildId = interaction.guildId!;
  const thresholds = await getThresholds(container, guildId);
  const decayRaw = await container.db.config.getModuleConfig(
    guildId,
    "mod",
    "warn_decay_days",
  );
  const decayDays = typeof decayRaw === "number" ? decayRaw : 30;

  await updatePanel(
    interaction,
    buildWarnThresholdsPanel(thresholds, decayDays, selection),
  );
}
