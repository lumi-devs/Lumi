import { badge, makeInfoCard, type CardReply } from "#lib/utilities/cards.js";
import { updatePanel } from "#lib/utilities/command-response.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
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

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `wt:select_count:${selectedCount}:${selectedAction}:${selectedDuration}`,
      )
      .setPlaceholder(
        `⚡ Select Warn Count Threshold (1 to 10)... Currently [${selectedCount}]`,
      )
      .addOptions(countSelectOptions),
  );

  const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `wt:select_action:${selectedCount}:${selectedAction}:${selectedDuration}`,
      )
      .setPlaceholder("🛡️ Select Punishment Action & Duration...")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("🔇 Mute - 1 Hour")
          .setValue("action:mute:1h")
          .setDescription("Timeout member for 1 Hour"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🔇 Mute - 24 Hours")
          .setValue("action:mute:24h")
          .setDescription("Timeout member for 24 Hours"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🔇 Mute - 7 Days")
          .setValue("action:mute:7d")
          .setDescription("Timeout member for 7 Days"),
        new StringSelectMenuOptionBuilder()
          .setLabel("👢 Kick Member")
          .setValue("action:kick")
          .setDescription("Kick member from server"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🔨 Ban Member (Permanent)")
          .setValue("action:ban")
          .setDescription("Permanently ban member"),
        new StringSelectMenuOptionBuilder()
          .setLabel("☣️ Quarantine Member")
          .setValue("action:quarantine")
          .setDescription("Apply Anti-Nuke Quarantine role"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🎙️ Voice Mute - 1 Hour")
          .setValue("action:vcmute:1h")
          .setDescription("Server-mute in voice for 1 Hour"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🎙️ Voice Mute - 24 Hours")
          .setValue("action:vcmute:24h")
          .setDescription("Server-mute in voice for 24 Hours"),
      ),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `wt:save_rule:${selectedCount}:${selectedAction}:${selectedDuration}`,
      )
      .setLabel(`➕ Save Rule for ${selectedCount} Warns`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`wt:remove_rule:${selectedCount}`)
      .setLabel(`🗑️ Remove ${selectedCount} Warns Rule`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!currentRuleForSelected),
    new ButtonBuilder()
      .setCustomId("wt:preset_standard")
      .setLabel("⚡ Apply 3-5-10 Preset")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("wt:clear_all")
      .setLabel("🧹 Reset All")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(entries.length === 0),
  );

  return makeInfoCard("⚡ Warning Threshold Control Center", bodyText, {
    actionRows: [row1, row2, row3],
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
