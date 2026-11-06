import {
  type CardReply,
  createActionButton,
  createRoleSelectMenu,
  createUserSelectMenu,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  getAutoroleConfig,
  type AutoroleConfig,
} from "../../../../modules/roles/autorole/config.js";
import { countPendingAutoroles } from "../../../../modules/roles/autorole/store.js";
import {
  backButton,
  type HubInteraction,
  type PanelInteraction,
  showPanel,
} from "../common.js";
import type { BotServices } from "../../../core/contracts.js";
import { servicesForModule } from "../../../core/modules.js";
import {
  AutoroleModuleName,
  MaxRoleOptions,
  booleanLabel,
  moduleBackButton,
  postCard,
  roleMentions,
} from "./shared.js";

export async function renderAutorolePanel(
  interaction: HubInteraction,
  services: BotServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const module = servicesForModule(services);
  const config = await getAutoroleConfig(module, guildId);
  const pending = await countPendingAutoroles(module, guildId);

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createRoleSelectMenu({
        customId: `lumi:aroles:${page}`,
        placeholder: "Choose the roles assigned on join…",
        minValues: 0,
        maxValues: MaxRoleOptions,
      }),
    ),
    row(
      createActionButton({
        customId: `lumi:ardelay:${page}`,
        label: "Delay",
        emoji: "⏱️",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:arrun:${page}`,
        label: "Run Queue",
        emoji: "▶️",
        style: ButtonStyle.Success,
      }),
      createActionButton({
        customId: `lumi:arpause:${page}`,
        label: config.paused ? "Resume" : "Pause",
        emoji: config.paused ? "▶️" : "⏸️",
        style: config.paused ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:arcancel:${page}`,
        label: "Cancel Pending",
        emoji: "🗑️",
        style: ButtonStyle.Danger,
      }),
      createActionButton({
        customId: `lumi:arfilters:${page}`,
        label: "Filters",
        emoji: "🧮",
        style: ButtonStyle.Secondary,
      }),
    ),
    row(
      createUserSelectMenu({
        customId: `lumi:arqueue:${page}`,
        placeholder: "Queue a member now…",
        minValues: 1,
        maxValues: 1,
      }),
    ),
    row(moduleBackButton(AutoroleModuleName, page)),
  ];

  return postCard(
    interaction,
    services,
    ["Autorole"],
    rows,
    `${services.moduleLoader.getModule(AutoroleModuleName)?.manifest.emoji ?? "🚪"} Autorole`,
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Status**\n${config.enabled ? "Enabled" : "Disabled"}${config.paused ? " · Paused" : ""}`,
      `**Roles**\n${roleMentions(config.roleIds)}`,
      `**Delay**\n${config.delaySeconds}s`,
      `**Minimum account age**\n${config.minAccountAgeHours}h`,
      `**Required roles**\n${roleMentions(config.requiredRoleIds)}`,
      `**Ignored roles**\n${roleMentions(config.ignoredRoleIds)}`,
      `**Ignore bots**\n${config.ignoreBots ? "Yes" : "No"} · **Only on join** ${config.onlyOnJoin ? "Yes" : "No"}`,
      `**Pending queue**\n${pending}`,
      "-# Use the role picker to replace autoroles, or Filters for eligibility settings.",
    ],
  );
}

export async function renderAutoroleFilters(
  interaction: HubInteraction,
  services: BotServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const config = await getAutoroleConfig(servicesForModule(services), guildId);
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createRoleSelectMenu({
        customId: `lumi:arrequired:${page}`,
        placeholder: "Required roles (member needs at least one)…",
        minValues: 0,
        maxValues: MaxRoleOptions,
      }),
    ),
    row(
      createRoleSelectMenu({
        customId: `lumi:arignored:${page}`,
        placeholder: "Roles that make a member ineligible…",
        minValues: 0,
        maxValues: MaxRoleOptions,
      }),
    ),
    row(
      createActionButton({
        customId: `lumi:arage:${page}`,
        label: "Min Age",
        emoji: "🕒",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:arignorebots:${page}`,
        label: `Ignore Bots: ${booleanLabel(config.ignoreBots)}`,
        emoji: "🤖",
        style: config.ignoreBots ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:aronlyjoin:${page}`,
        label: `Only On Join: ${booleanLabel(config.onlyOnJoin)}`,
        emoji: "🚪",
        style: config.onlyOnJoin ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
    ),
    row(backButton(`lumi:autorole:${page}`, "Back")),
  ];

  return postCard(
    interaction,
    services,
    ["Autorole", "Filters"],
    rows,
    `${services.moduleLoader.getModule(AutoroleModuleName)?.manifest.emoji ?? "🚪"} Autorole Filters`,
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Minimum account age**\n${config.minAccountAgeHours}h`,
      `**Required roles**\n${roleMentions(config.requiredRoleIds)}`,
      `**Ignored roles**\n${roleMentions(config.ignoredRoleIds)}`,
      `**Ignore bots**\n${config.ignoreBots ? "Yes" : "No"} · **Only on join** ${config.onlyOnJoin ? "Yes" : "No"}`,
      "-# Required roles need at least one match; ignored roles make a member ineligible.",
    ],
  );
}

export function autoroleAgeModal(
  config: AutoroleConfig,
  page: number,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:armodalage:${page}`)
    .setTitle("Set minimum account age")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("hours")
          .setLabel("Minimum account age in hours (0 = off)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setValue(String(config.minAccountAgeHours)),
      ),
    );
}

export function autoroleDelayModal(
  config: AutoroleConfig,
  page: number,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:armodaldelay:${page}`)
    .setTitle("Set autorole delay")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("seconds")
          .setLabel("Delay in seconds (0 = immediate)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7)
          .setValue(String(config.delaySeconds)),
      ),
    );
}

export async function renderAutoroleNotice(
  interaction: PanelInteraction,
  services: BotServices,
  message: string,
): Promise<void> {
  await showPanel(interaction, () =>
    renderAutorolePanel(interaction, services, 0, message),
  );
}
