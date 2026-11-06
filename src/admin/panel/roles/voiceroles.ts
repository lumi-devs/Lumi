import {
  type CardReply,
  createActionButton,
  createChannelSelectMenu,
  createRoleSelectMenu,
  createStringSelectMenu,
  makeErrorCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  type MessageActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  getVoiceRoleMapping,
  listVoiceRoleMappings,
} from "../../../../modules/roles/voiceroles/store.js";
import {
  backButton,
  cut,
  type HubInteraction,
  panelOptions,
} from "../common.js";
import type { BotServices } from "../../../core/contracts.js";
import { servicesForModule } from "../../../core/modules.js";
import {
  VoiceRolesModuleName,
  channelLabel,
  guildChannel,
  moduleBackButton,
  pageButtons,
  pageItems,
  pageTotal,
  postCard,
} from "./shared.js";

export async function renderVoiceRolesPanel(
  interaction: HubInteraction,
  services: BotServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const mappings = await listVoiceRoleMappings(
    servicesForModule(services),
    guildId,
  );
  const totalPages = pageTotal(mappings.length);
  const visible = pageItems(mappings, page);
  const lines =
    mappings.length === 0
      ? ["No voice role mappings configured yet."]
      : visible.map((mapping) => {
          const category = mapping.categoryId
            ? ` · category <#${mapping.categoryId}>`
            : "";
          return `<#${mapping.channelId}> → <@&${mapping.roleId}> · ${mapping.enabled ? "Enabled" : "Disabled"} · grace ${mapping.graceSeconds}s${category}`;
        });

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createChannelSelectMenu({
        customId: `lumi:vrnew:${page}`,
        placeholder: "Add a voice or stage channel mapping…",
        channelTypes: [ChannelType.GuildVoice, ChannelType.GuildStageVoice],
        minValues: 1,
        maxValues: 1,
      }),
    ),
  ];
  if (mappings.length > 0) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `lumi:vrpick:${page}`,
          placeholder: "Manage a mapping…",
          options: await Promise.all(
            visible.map(async (mapping) => ({
              label: cut(
                (
                  await guildChannel(
                    interaction.guild ?? null,
                    mapping.channelId,
                  )
                )?.name ?? mapping.channelId,
                100,
              ),
              value: mapping.channelId,
              description: `Grace ${mapping.graceSeconds}s · ${mapping.enabled ? "Enabled" : "Disabled"}`,
            })),
          ),
        }),
      ),
    );
  }
  const nav = pageButtons("vrpage", page, totalPages);
  if (nav.length > 0) rows.push(row(...nav));
  rows.push(row(moduleBackButton(VoiceRolesModuleName, page)));

  return postCard(
    interaction,
    services,
    ["Voice Roles"],
    rows,
    `${services.moduleLoader.getModule(VoiceRolesModuleName)?.manifest.emoji ?? "🔊"} Voice Roles`,
    [
      ...(notice ? [`**${notice}**`] : []),
      ...lines,
      "-# Voice roles are assigned while members are connected, with an optional grace period after leaving.",
    ],
  );
}

export async function renderVoiceRoleMapping(
  interaction: HubInteraction,
  services: BotServices,
  channelId: string,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const mapping = await getVoiceRoleMapping(
    servicesForModule(services),
    guildId,
    channelId,
  );
  if (!mapping) {
    return makeErrorCard(
      "Mapping Missing",
      "That voice role mapping no longer exists.",
      panelOptions(
        interaction,
        "modules",
        ["Hub", "Modules", "Voice Roles"],
        [row(backButton(`lumi:voiceroles:${page}`))],
        undefined,
        false,
      ),
    );
  }

  const channel = await channelLabel(
    interaction.guild ?? null,
    mapping.channelId,
  );
  const category = mapping.categoryId
    ? await channelLabel(interaction.guild ?? null, mapping.categoryId)
    : "*none*";

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createActionButton({
        customId: `lumi:vrtoggle:${mapping.channelId}:${page}`,
        label: mapping.enabled ? "Disable" : "Enable",
        emoji: mapping.enabled ? "⛔" : "✅",
        style: mapping.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
      }),
      createActionButton({
        customId: `lumi:vrgrace:${mapping.channelId}:${page}`,
        label: "Grace",
        emoji: "⏱️",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:vrremove:${mapping.channelId}:${page}`,
        label: "Remove",
        emoji: "🗑️",
        style: ButtonStyle.Danger,
      }),
    ),
    row(
      createChannelSelectMenu({
        customId: `lumi:vrcat:${mapping.channelId}:${page}`,
        placeholder: "Set or clear the category match…",
        channelTypes: [ChannelType.GuildCategory],
        minValues: 0,
        maxValues: 1,
      }),
    ),
    row(backButton(`lumi:voiceroles:${page}`)),
  ];

  return postCard(
    interaction,
    services,
    ["Voice Roles", mapping.channelId],
    rows,
    "🔊 Voice Role Mapping",
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Channel**\n${channel}`,
      `**Role**\n<@&${mapping.roleId}>`,
      `**Category**\n${category}`,
      `**Grace**\n${mapping.graceSeconds}s`,
      `**Status**\n${mapping.enabled ? "Enabled" : "Disabled"}`,
    ],
  );
}

export async function renderVoiceRoleAdd(
  interaction: HubInteraction,
  services: BotServices,
  channelId: string,
  categoryId: string | null,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const channel = await channelLabel(interaction.guild ?? null, channelId);
  const category = categoryId
    ? await channelLabel(interaction.guild ?? null, categoryId)
    : "*none*";
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createRoleSelectMenu({
        customId: `lumi:vrnewrole:${channelId}:${categoryId ?? "none"}:${page}`,
        placeholder: "Choose the role to assign…",
        minValues: 1,
        maxValues: 1,
      }),
    ),
    row(
      createChannelSelectMenu({
        customId: `lumi:vrnewcat:${channelId}:${page}`,
        placeholder: "Also match a category (optional)…",
        channelTypes: [ChannelType.GuildCategory],
        minValues: 0,
        maxValues: 1,
      }),
    ),
    row(backButton(`lumi:voiceroles:${page}`)),
  ];

  return postCard(
    interaction,
    services,
    ["Voice Roles", "Add"],
    rows,
    "🔊 Add Voice Role",
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Channel**\n${channel}`,
      `**Category**\n${category}`,
      "-# Choose a role to create the mapping.",
    ],
  );
}

export async function renderVoiceRoleRemove(
  interaction: HubInteraction,
  _services: BotServices,
  channelId: string,
  page = 0,
): Promise<CardReply> {
  const channel = await channelLabel(interaction.guild ?? null, channelId);
  return makeWarningCard(
    "Remove Voice Role",
    `Remove the voice role mapping for ${channel}?`,
    panelOptions(
      interaction,
      "modules",
      ["Hub", "Modules", "Voice Roles", "Remove"],
      [
        row(
          createActionButton({
            customId: `lumi:vrremoveconfirm:${channelId}:${page}`,
            label: "Remove Mapping",
            emoji: "🗑️",
            style: ButtonStyle.Danger,
          }),
          backButton(`lumi:vr:${channelId}:${page}`, "Cancel"),
        ),
      ],
      undefined,
      false,
    ),
  );
}

export function voiceGraceModal(
  channelId: string,
  page: number,
  graceSeconds: number,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:vrmodalgrace:${channelId}:${page}`)
    .setTitle("Set voice role grace period")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("seconds")
          .setLabel("Grace in seconds (0 = remove on leave)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(6)
          .setValue(String(graceSeconds)),
      ),
    );
}
