import {
  type CardReply,
  createActionButton,
  createChannelSelectMenu,
  createRoleSelectMenu,
  createStringSelectMenu,
  ephemeralCard,
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
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  getVoiceRolesConfig,
  VoiceRolesModuleName,
} from "./config.js";
import {
  deleteVoiceRoleMapping,
  getVoiceRoleMapping,
  listVoiceRoleMappings,
  setVoiceRoleEnabled,
  upsertVoiceRoleMapping,
} from "./store.js";
import type { BotServices } from "../../../src/core/contracts.js";
import { servicesForModule } from "../../../src/core/modules.js";
import {
  backButton,
  cut,
  type HubInteraction,
  type ModuleActionParams,
  type PanelInteraction,
  panelOptions,
  showPanel,
} from "../../../src/admin/panel/common.js";
import {
  channelLabel,
  guildChannel,
  isSnowflake,
  moduleBackButton,
  pageButtons,
  pageItems,
  pageNumber,
  pageTotal,
  postCard,
  replyOrUpdate,
} from "../../../src/admin/panel/roles/shared.js";

export { VoiceRolesModuleName } from "./config.js";

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

  const lines: string[] = [];
  if (mappings.length === 0) {
    lines.push("No voice role mappings exist yet.");
  } else {
    for (const mapping of visible) {
      const channel = await channelLabel(
        interaction.guild ?? null,
        mapping.channelId,
      );
      lines.push(
        `**${channel}** → <@&${mapping.roleId}>`,
        `-# Grace ${mapping.graceSeconds}s · ${mapping.enabled ? "Active" : "Disabled"}${mapping.categoryId ? ` · Category <#${mapping.categoryId}>` : ""}`,
      );
    }
  }

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createChannelSelectMenu({
        customId: `lumi:vrnew:${page}`,
        placeholder: "Add a voice channel mapping…",
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
            visible.map(async (mapping) => {
              const ch = await guildChannel(
                interaction.guild ?? null,
                mapping.channelId,
              );
              const name = ch ? `#${ch.name}` : mapping.channelId;
              const role = interaction.guild?.roles.cache.get(mapping.roleId);
              return {
                label: cut(name, 100),
                value: mapping.channelId,
                description: cut(
                  `Role @${role?.name ?? mapping.roleId} · ${mapping.graceSeconds}s`,
                  100,
                ),
              };
            }),
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
    `${services.moduleLoader.getModule(VoiceRolesModuleName)?.manifest.emoji ?? "🎙️"} Voice Roles`,
    [
      ...(notice ? [`**${notice}**`] : []),
      ...lines,
      "-# Members receive the linked role while connected to the channel.",
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

  const channel = await channelLabel(interaction.guild ?? null, channelId);
  const category = mapping.categoryId
    ? await channelLabel(interaction.guild ?? null, mapping.categoryId)
    : "*none*";

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createChannelSelectMenu({
        customId: `lumi:vrcat:${channelId}:${page}`,
        placeholder: "Restrict to a category (optional)…",
        channelTypes: [ChannelType.GuildCategory],
        minValues: 0,
        maxValues: 1,
      }),
    ),
    row(
      createActionButton({
        customId: `lumi:vrtoggle:${channelId}:${page}`,
        label: mapping.enabled ? "Disable" : "Enable",
        emoji: mapping.enabled ? "⛔" : "✅",
        style: mapping.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
      }),
      createActionButton({
        customId: `lumi:vrgrace:${channelId}:${page}`,
        label: "Grace Period",
        emoji: "⏱️",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:vrremove:${channelId}:${page}`,
        label: "Remove",
        emoji: "🗑️",
        style: ButtonStyle.Danger,
      }),
    ),
    row(backButton(`lumi:voiceroles:${page}`)),
  ];

  return postCard(
    interaction,
    services,
    ["Voice Roles", "Mapping"],
    rows,
    `${services.moduleLoader.getModule(VoiceRolesModuleName)?.manifest.emoji ?? "🎙️"} Voice Role Mapping`,
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Channel**\n${channel}`,
      `**Role**\n<@&${mapping.roleId}>`,
      `**Category restriction**\n${category}`,
      `**Grace period**\n${mapping.graceSeconds}s`,
      `**Status**\n${mapping.enabled ? "Active" : "Disabled"}`,
      "-# Category restriction requires the temporary VC to belong to that category.",
    ],
  );
}

export async function renderVoiceRoleAdd(
  interaction: HubInteraction,
  services: BotServices,
  channelId: string,
  categoryId: string | null,
  page = 0,
): Promise<CardReply> {
  const channel = await channelLabel(interaction.guild ?? null, channelId);
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createChannelSelectMenu({
        customId: `lumi:vrnewcat:${channelId}:${page}`,
        placeholder: "Optional category constraint…",
        channelTypes: [ChannelType.GuildCategory],
        minValues: 0,
        maxValues: 1,
      }),
    ),
    row(
      createRoleSelectMenu({
        customId: `lumi:vrnewrole:${channelId}:${categoryId ?? "none"}:${page}`,
        placeholder: "Choose the role to assign…",
        minValues: 1,
        maxValues: 1,
      }),
    ),
    row(backButton(`lumi:voiceroles:${page}`, "Cancel")),
  ];

  return postCard(
    interaction,
    services,
    ["Voice Roles", "Add"],
    rows,
    `${services.moduleLoader.getModule(VoiceRolesModuleName)?.manifest.emoji ?? "🎙️"} Link Voice Channel`,
    [
      `**Target channel**\n${channel}`,
      `**Category restriction**\n${categoryId ? `<#${categoryId}>` : "*none*"}`,
      "-# Pick a category restriction if desired, then choose the role to link.",
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
    "Remove Voice Role Mapping",
    [
      `Remove the voice role mapping for ${channel}?`,
      "Members will no longer receive or lose the role through this channel.",
    ],
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
  current: number,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:vrmodalgrace:${channelId}:${page}`)
    .setTitle("Set disconnect grace period")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("seconds")
          .setLabel("Grace in seconds (0 = immediate removal)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(6)
          .setValue(String(current)),
      ),
    );
}

export async function handleVoiceRolesAction(
  interaction: PanelInteraction,
  services: BotServices,
  params: ModuleActionParams,
): Promise<boolean> {
  const { guildId, action, target, extra, extra2 } = params;
  if (action === "voiceroles") {
    await showPanel(interaction, () =>
      renderVoiceRolesPanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (!action.startsWith("vr")) return false;

  switch (action) {
    case "vrnew": {
      if (!interaction.isChannelSelectMenu()) return true;
      const channelId = interaction.values[0];
      if (!isSnowflake(channelId)) return true;
      await showPanel(interaction, () =>
        renderVoiceRoleAdd(
          interaction,
          services,
          channelId,
          null,
          pageNumber(target),
        ),
      );
      return true;
    }
    case "vrnewcat": {
      if (!interaction.isChannelSelectMenu()) return true;
      if (!isSnowflake(target)) return true;
      const categoryId = interaction.values[0] ?? null;
      await showPanel(interaction, () =>
        renderVoiceRoleAdd(
          interaction,
          services,
          target,
          categoryId,
          pageNumber(extra),
        ),
      );
      return true;
    }
    case "vrnewrole": {
      if (!interaction.isRoleSelectMenu()) return true;
      if (!isSnowflake(target)) return true;
      const roleId = interaction.values[0];
      if (!roleId) return true;
      const categoryId = extra === "none" ? null : extra;
      const config = await getVoiceRolesConfig(
        servicesForModule(services),
        guildId,
      );
      await upsertVoiceRoleMapping(servicesForModule(services), {
        guildId,
        channelId: target,
        categoryId,
        roleId,
        graceSeconds: config.defaultGraceSeconds,
      });
      await showPanel(interaction, () =>
        renderVoiceRoleMapping(
          interaction,
          services,
          target,
          pageNumber(extra2),
          "✅ Mapping created.",
        ),
      );
      return true;
    }
    case "vrpage": {
      await showPanel(interaction, () =>
        renderVoiceRolesPanel(interaction, services, pageNumber(target)),
      );
      return true;
    }
    case "vrpick": {
      if (!interaction.isStringSelectMenu()) return true;
      const channelId = interaction.values[0];
      if (!channelId) return true;
      await showPanel(interaction, () =>
        renderVoiceRoleMapping(
          interaction,
          services,
          channelId,
          pageNumber(target),
        ),
      );
      return true;
    }
    case "vr": {
      if (!isSnowflake(target)) return true;
      await showPanel(interaction, () =>
        renderVoiceRoleMapping(
          interaction,
          services,
          target,
          pageNumber(extra),
        ),
      );
      return true;
    }
    case "vrcat": {
      if (!interaction.isChannelSelectMenu()) return true;
      if (!isSnowflake(target)) return true;
      const categoryId = interaction.values[0] ?? null;
      const mapping = await getVoiceRoleMapping(
        servicesForModule(services),
        guildId,
        target,
      );
      if (!mapping) return true;
      await upsertVoiceRoleMapping(servicesForModule(services), {
        guildId,
        channelId: target,
        categoryId,
        roleId: mapping.roleId,
        graceSeconds: mapping.graceSeconds,
      });
      await showPanel(interaction, () =>
        renderVoiceRoleMapping(
          interaction,
          services,
          target,
          pageNumber(extra),
          categoryId ? "✅ Category updated." : "✅ Category cleared.",
        ),
      );
      return true;
    }
    case "vrtoggle": {
      if (!interaction.isButton()) return true;
      if (!isSnowflake(target)) return true;
      const mapping = await getVoiceRoleMapping(
        servicesForModule(services),
        guildId,
        target,
      );
      if (!mapping) return true;
      await setVoiceRoleEnabled(
        servicesForModule(services),
        guildId,
        target,
        !mapping.enabled,
      );
      await showPanel(interaction, () =>
        renderVoiceRoleMapping(
          interaction,
          services,
          target,
          pageNumber(extra),
          mapping.enabled ? "⛔ Mapping disabled." : "✅ Mapping enabled.",
        ),
      );
      return true;
    }
    case "vrgrace": {
      if (!interaction.isButton()) return true;
      if (!isSnowflake(target)) return true;
      const mapping = await getVoiceRoleMapping(
        servicesForModule(services),
        guildId,
        target,
      );
      if (!mapping) return true;
      await interaction.showModal(
        voiceGraceModal(target, pageNumber(extra), mapping.graceSeconds),
      );
      return true;
    }
    case "vrremove": {
      if (!isSnowflake(target)) return true;
      await showPanel(interaction, () =>
        renderVoiceRoleRemove(
          interaction,
          services,
          target,
          pageNumber(extra),
        ),
      );
      return true;
    }
    case "vrremoveconfirm": {
      if (!isSnowflake(target)) return true;
      await deleteVoiceRoleMapping(
        servicesForModule(services),
        guildId,
        target,
      );
      await showPanel(interaction, () =>
        renderVoiceRolesPanel(
          interaction,
          services,
          pageNumber(extra),
          "🗑️ Mapping removed.",
        ),
      );
      return true;
    }
    default:
      return false;
  }
}

export async function handleVoiceRolesModal(
  interaction: ModalSubmitInteraction,
  services: BotServices,
  guildId: string,
  parts: string[],
): Promise<boolean> {
  const action = parts[1];
  if (action === "vrmodalgrace") {
    const raw = interaction.fields.getTextInputValue("seconds").trim();
    const seconds = Number(raw);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Grace",
            "Enter a whole number from 0 to 86400 seconds.",
          ),
        ),
      );
      return true;
    }
    const channelId = parts[2];
    if (!isSnowflake(channelId)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Mapping Missing", "That mapping no longer exists."),
        ),
      );
      return true;
    }
    const mapping = await getVoiceRoleMapping(
      servicesForModule(services),
      guildId,
      channelId,
    );
    if (!mapping) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Mapping Missing", "That mapping no longer exists."),
        ),
      );
      return true;
    }
    await upsertVoiceRoleMapping(servicesForModule(services), {
      guildId,
      channelId,
      categoryId: mapping.categoryId,
      roleId: mapping.roleId,
      graceSeconds: seconds,
    });
    await replyOrUpdate(
      interaction,
      await renderVoiceRoleMapping(
        interaction,
        services,
        channelId,
        pageNumber(parts[3]),
        `⏱️ Grace set to ${seconds}s.`,
      ),
    );
    return true;
  }

  return false;
}
