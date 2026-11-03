import type { ModuleServices } from "@lumi/module-kit";
import {
  type CardReply,
  createActionButton,
  createChannelSelectMenu,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  ephemeralCard,
  makeCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  getAutoroleConfig,
  type AutoroleConfig,
  saveAutoroleConfig,
} from "../../../modules/roles/autorole/config.js";
import {
  evaluateAutoroleCandidate,
  selectRolesToAssign,
} from "../../../modules/roles/autorole/logic.js";
import {
  cancelPendingAutoroles,
  countPendingAutoroles,
  enqueueAutorole,
  processPendingAutoroles,
} from "../../../modules/roles/autorole/store.js";
import { fetchMember } from "../../../modules/roles/shared.js";
import { getVoiceRolesConfig } from "../../../modules/roles/voiceroles/config.js";
import {
  deleteVoiceRoleMapping,
  getVoiceRoleMapping,
  listVoiceRoleMappings,
  setVoiceRoleEnabled,
  upsertVoiceRoleMapping,
} from "../../../modules/roles/voiceroles/store.js";
import {
  getRoleMenusConfig,
  MaxTempDurationSeconds,
} from "../../../modules/role-menus/menu/config.js";
import {
  deleteRoleMenuMessage,
  postRoleMenu,
  refreshRoleMenuMessage,
  type SendableChannel,
} from "../../../modules/role-menus/menu/posting.js";
import { formatTempDuration } from "../../../modules/role-menus/menu/selection.js";
import type { GroupRecord } from "../../../modules/role-menus/menu/service.js";
import {
  groupMode,
  type RoleMenuStyle,
} from "../../../modules/role-menus/menu/ui.js";
import {
  backButton,
  cut,
  type HubInteraction,
  type MessageModalSubmit,
  type PanelInteraction,
  panelOptions,
  showPanel,
} from "./common.js";
import type { HubServices } from "./services.js";

export const AutoroleModuleName = "roles-autorole";
export const VoiceRolesModuleName = "roles-voiceroles";
export const RoleMenusModuleName = "role-menus-menu";

const MaxRoleOptions = 25;
const MaxGroupOptions = 20;
const MaxReactionOptions = 20;

function pageNumber(raw: string | undefined): number {
  return Number(raw) || 0;
}

function moduleServices(services: HubServices): ModuleServices {
  return services as unknown as ModuleServices;
}

function roleMentions(roleIds: readonly string[]): string {
  return roleIds.length > 0
    ? roleIds.map((roleId) => `<@&${roleId}>`).join(", ")
    : "*none*";
}

function booleanLabel(value: boolean): string {
  return value ? "On" : "Off";
}

function styleLabel(style: string): string {
  return style === "reactions"
    ? "Reactions"
    : style === "select"
      ? "Select menu"
      : "Buttons";
}

function isSnowflake(value: string | undefined): value is string {
  return Boolean(value && /^\d{15,22}$/.test(value));
}

async function guildChannel(
  guild: Guild | null,
  channelId: string,
): Promise<GuildBasedChannel | null> {
  if (!guild) return null;
  return (
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function channelLabel(
  guild: Guild | null,
  channelId: string,
): Promise<string> {
  const channel = await guildChannel(guild, channelId);
  return channel ? `<#${channel.id}>` : `<#${channelId}>`;
}

async function replyOrUpdate(
  interaction: ModalSubmitInteraction,
  card: CardReply,
): Promise<void> {
  if (interaction.isFromMessage()) {
    await (interaction as MessageModalSubmit).update(card);
  } else {
    await interaction.reply(ephemeralCard(card));
  }
}

function moduleBackButton(moduleName: string, page: number) {
  return backButton(`lumi:modopen:${moduleName}:${page}`);
}

function pageItems<T>(items: readonly T[], page: number): readonly T[] {
  const start = Math.max(0, page) * MaxRoleOptions;
  return items.slice(start, start + MaxRoleOptions);
}

function pageTotal(total: number): number {
  return Math.max(1, Math.ceil(total / MaxRoleOptions));
}

function pageButtons(action: string, page: number, totalPages: number) {
  const buttons = [];
  if (page > 0) {
    buttons.push(
      createActionButton({
        customId: `lumi:${action}:${page - 1}`,
        label: "Previous",
        emoji: "⬅️",
        style: ButtonStyle.Secondary,
      }),
    );
  }
  if (page + 1 < totalPages) {
    buttons.push(
      createActionButton({
        customId: `lumi:${action}:${page + 1}`,
        label: "Next",
        emoji: "➡️",
        style: ButtonStyle.Secondary,
      }),
    );
  }
  return buttons;
}

async function postCard(
  interaction: HubInteraction,
  _services: HubServices,
  breadcrumbs: string[],
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  title: string,
  body: string[],
): Promise<CardReply> {
  return makeCard(
    undefined,
    title,
    body,
    panelOptions(
      interaction,
      "modules",
      ["Hub", "Modules", ...breadcrumbs],
      rows,
      undefined,
      false,
    ),
  );
}

/* ------------------------------- Autorole ------------------------------- */

export async function renderAutorolePanel(
  interaction: HubInteraction,
  services: HubServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const module = moduleServices(services);
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
  services: HubServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const config = await getAutoroleConfig(moduleServices(services), guildId);
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
    row(
      backButton(
        `lumi:autorole:${page}`,
        "Back",
      ),
    ),
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

function autoroleAgeModal(config: AutoroleConfig, page: number): ModalBuilder {
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

function autoroleDelayModal(config: AutoroleConfig, page: number): ModalBuilder {
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

async function renderAutoroleNotice(
  interaction: PanelInteraction,
  services: HubServices,
  message: string,
): Promise<void> {
  await showPanel(interaction, () =>
    renderAutorolePanel(interaction, services, 0, message),
  );
}

/* ------------------------------ Voice roles ----------------------------- */

export async function renderVoiceRolesPanel(
  interaction: HubInteraction,
  services: HubServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const mappings = await listVoiceRoleMappings(moduleServices(services), guildId);
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
                (await guildChannel(interaction.guild ?? null, mapping.channelId))
                  ?.name ?? mapping.channelId,
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
  services: HubServices,
  channelId: string,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const mapping = await getVoiceRoleMapping(
    moduleServices(services),
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

  const channel = await channelLabel(interaction.guild ?? null, mapping.channelId);
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
  services: HubServices,
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
  _services: HubServices,
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

function voiceGraceModal(
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

/* ------------------------------- Role menus ----------------------------- */

function groupSummary(group: {
  readonly name: string;
  readonly mode: string;
  readonly maxSelections: number | null;
  readonly tempDurationSeconds: number | null;
  readonly requireOne: boolean;
  readonly autoToggle: boolean;
  readonly options: readonly unknown[];
}): string {
  const mode = group.mode === "single" ? "single" : "multiple";
  const limit =
    mode === "single"
      ? "single"
      : group.maxSelections && group.maxSelections > 0
        ? `up to ${group.maxSelections}`
        : "unlimited";
  return `**${group.name}** — ${mode} (${limit}) · ${group.options.length} option${group.options.length === 1 ? "" : "s"} · ${formatTempDuration(group.tempDurationSeconds)}${group.requireOne ? " · one required" : ""}${group.autoToggle ? " · auto-toggle" : ""}`;
}

export async function renderRoleMenusPanel(
  interaction: HubInteraction,
  services: HubServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const groups = await services.helpers.roleMenus.listGroups(guildId);
  const totalPages = pageTotal(groups.length);
  const visible = pageItems(groups, page);
  const lines =
    groups.length === 0
      ? ["No role menu groups exist yet."]
      : visible.map((group) => groupSummary(group));

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createActionButton({
        customId: `lumi:rmcreate:${page}`,
        label: "Create Group",
        emoji: "➕",
        style: ButtonStyle.Primary,
      }),
    ),
  ];
  if (groups.length > 0) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `lumi:rmpick:${page}`,
          placeholder: "Manage a role menu group…",
          options: visible.map((group) => ({
            label: cut(group.name, 100),
            value: group.id,
            description: `${group.options.length} option${group.options.length === 1 ? "" : "s"} · ${groupMode(group)}`,
          })),
        }),
      ),
    );
  }
  const nav = pageButtons("rmpage", page, totalPages);
  if (nav.length > 0) rows.push(row(...nav));
  rows.push(row(moduleBackButton(RoleMenusModuleName, page)));

  return postCard(
    interaction,
    services,
    ["Role Menus"],
    rows,
    `${services.moduleLoader.getModule(RoleMenusModuleName)?.manifest.emoji ?? "🎭"} Role Menus`,
    [
      ...(notice ? [`**${notice}**`] : []),
      ...lines,
      "-# Create a group, add role options, then post it to a channel.",
    ],
  );
}

function roleMenuCreateModal(page: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:rmmodalcreate:${page}`)
    .setTitle("Create role menu group")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Group name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("mode")
          .setLabel("Mode: single or multiple")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(8)
          .setValue("multiple"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("max")
          .setLabel("Max selections (0 = unlimited)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setValue("0"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("temp")
          .setLabel("Temp duration seconds (0 = permanent)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7)
          .setValue("0"),
      ),
    );
}

function roleMenuEditModal(
  group: GroupRecord,
  page: number,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:rmmodaledit:${group.id}:${page}`)
    .setTitle("Edit role menu group")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Group name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setValue(group.name),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setValue(group.description ?? ""),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("mode")
          .setLabel("Mode: single or multiple")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(8)
          .setValue(groupMode(group)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("max")
          .setLabel("Max selections (0 = unlimited)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setValue(String(group.maxSelections ?? 0)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("temp")
          .setLabel("Temp duration seconds (0 = permanent)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7)
          .setValue(String(group.tempDurationSeconds ?? 0)),
      ),
    );
}

export async function renderRoleMenuGroup(
  interaction: HubInteraction,
  services: HubServices,
  groupId: string,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const group = await services.helpers.roleMenus.findGroupById(guildId, groupId);
  if (!group) {
    return makeErrorCard(
      "Role Menu Missing",
      "That role menu group no longer exists.",
      panelOptions(
        interaction,
        "modules",
        ["Hub", "Modules", "Role Menus"],
        [row(backButton(`lumi:rolemenus:${page}`))],
        undefined,
        false,
      ),
    );
  }

  const optionLines = group.options
    .slice(0, MaxGroupOptions)
    .map((option) => {
      const emoji = option.emoji ? `${option.emoji} ` : "";
      return `• ${emoji}**${option.label}** — <@&${option.roleId}>`;
    });
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createRoleSelectMenu({
        customId: `lumi:rmaddrole:${group.id}:${page}`,
        placeholder: "Add a role option…",
        minValues: 1,
        maxValues: 1,
      }),
    ),
  ];
  if (group.options.length > 0) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `lumi:rmdelopt:${group.id}:${page}`,
          placeholder: "Remove a role option…",
          options: group.options.slice(0, MaxRoleOptions).map((option) => ({
            label: cut(option.label, 100),
            value: option.id,
            description: cut(
              interaction.guild?.roles.cache.get(option.roleId)?.name ??
                "Unknown role",
              100,
            ),
          })),
          minValues: 1,
          maxValues: 1,
        }),
      ),
    );
  }
  rows.push(
    row(
      createActionButton({
        customId: `lumi:rmedit:${group.id}:${page}`,
        label: "Edit",
        emoji: "✏️",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:rmpost:${group.id}:${page}`,
        label: "Post",
        emoji: "📣",
        style: ButtonStyle.Primary,
      }),
      createActionButton({
        customId: `lumi:rmrefresh:${group.id}:${page}`,
        label: "Refresh",
        emoji: "🔄",
        style: ButtonStyle.Secondary,
      }),
    ),
  );
  rows.push(
    row(
      createActionButton({
        customId: `lumi:rmtoggle:${group.id}:requireOne:${page}`,
        label: `Require One: ${booleanLabel(group.requireOne)}`,
        emoji: "1️⃣",
        style: group.requireOne ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:rmtoggle:${group.id}:autoToggle:${page}`,
        label: `Auto Toggle: ${booleanLabel(group.autoToggle)}`,
        emoji: "🔁",
        style: group.autoToggle ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:rmdelete:${group.id}:${page}`,
        label: "Delete",
        emoji: "🗑️",
        style: ButtonStyle.Danger,
      }),
    ),
  );
  rows.push(row(backButton(`lumi:rolemenus:${page}`)));

  return postCard(
    interaction,
    services,
    ["Role Menus", group.name],
    rows,
    `🎭 ${group.name}`,
    [
      ...(notice ? [`**${notice}**`] : []),
      group.description ?? "*No description.*",
      `**Mode** ${groupMode(group)} · **Max** ${group.maxSelections && group.maxSelections > 0 ? group.maxSelections : "unlimited"}`,
      `**Temporary** ${formatTempDuration(group.tempDurationSeconds)}`,
      `**Require one** ${booleanLabel(group.requireOne)} · **Auto toggle** ${booleanLabel(group.autoToggle)}`,
      ...(optionLines.length > 0 ? optionLines : ["*No options yet.*"]),
    ],
  );
}

export async function renderRoleMenuPost(
  interaction: HubInteraction,
  services: HubServices,
  groupId: string,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const group = await services.helpers.roleMenus.findGroupById(guildId, groupId);
  if (!group) {
    return makeErrorCard(
      "Role Menu Missing",
      "That role menu group no longer exists.",
      panelOptions(
        interaction,
        "modules",
        ["Hub", "Modules", "Role Menus"],
        [row(backButton(`lumi:rolemenus:${page}`))],
        undefined,
        false,
      ),
    );
  }

  return postCard(
    interaction,
    services,
    ["Role Menus", group.name, "Post"],
    [
      row(
        createStringSelectMenu({
          customId: `lumi:rmpoststyle:${group.id}:${page}`,
          placeholder: "Choose how members claim roles…",
          options: [
            { label: "Buttons", value: "buttons", emoji: "🔘" },
            { label: "Select menu", value: "select", emoji: "📋" },
            { label: "Reactions", value: "reactions", emoji: "😀" },
          ],
        }),
      ),
      row(backButton(`lumi:rm:${group.id}:${page}`, "Cancel")),
    ],
    `📣 Post ${group.name}`,
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Options** ${group.options.length}`,
      "-# Choose a style, then choose the channel.",
    ],
  );
}

export async function renderRoleMenuDelete(
  interaction: HubInteraction,
  _services: HubServices,
  group: GroupRecord,
  page = 0,
): Promise<CardReply> {
  return makeWarningCard(
    "Delete Role Menu",
    `Delete **${group.name}** and remove its ${group.options.length} option${group.options.length === 1 ? "" : "s"}? Posted menus will be deleted.`,
    panelOptions(
      interaction,
      "modules",
      ["Hub", "Modules", "Role Menus", group.name, "Delete"],
      [
        row(
          createActionButton({
            customId: `lumi:rmdelconfirm:${group.id}:${page}`,
            label: "Delete Group",
            emoji: "🗑️",
            style: ButtonStyle.Danger,
          }),
          backButton(`lumi:rm:${group.id}:${page}`, "Cancel"),
        ),
      ],
      undefined,
      false,
    ),
  );
}

async function deleteGroup(
  services: HubServices,
  group: GroupRecord,
): Promise<number> {
  const messages = await services.helpers.roleMenus.listGroupMessageLocations(
    group.id,
  );
  const module = moduleServices(services);
  const guild = services.client.guilds.cache.get(group.guildId) ?? null;
  if (guild) {
    for (const message of messages) {
      await deleteRoleMenuMessage(module, message);
    }
  }
  const roleIds = group.options.map((option) => option.roleId);
  if (roleIds.length > 0) {
    await services.helpers.roleMenus
      .deleteTempRolesForRoleIds(group.guildId, roleIds)
      .catch(() => undefined);
  }
  await services.helpers.roleMenus.deleteGroup(group.id);
  return messages.length;
}

async function postGroup(
  interaction: HubInteraction,
  services: HubServices,
  group: GroupRecord,
  style: RoleMenuStyle,
  channel: SendableChannel,
): Promise<CardReply> {
  const result = await postRoleMenu(
    moduleServices(services),
    interaction.guild!,
    group,
    group.options,
    style,
    channel,
  );
  if ("error" in result) {
    return makeErrorCard("Post Failed", result.error);
  }
  return makeSuccessCard(`🎭 ${group.name}`, [
    `Posted a **${styleLabel(style)}** menu in <#${result.channelId}>.`,
    `[Open message](https://discord.com/channels/${group.guildId}/${result.channelId}/${result.messageId})`,
  ]);
}

function parseMode(raw: string): "single" | "multiple" | null {
  const value = raw.trim().toLowerCase();
  return value === "single" || value === "multiple" ? value : null;
}

function parseOptionalLimit(raw: string, max: number): number | null | false {
  const normalized = raw.trim();
  if (normalized.length === 0) return null;
  const value = Number(normalized);
  if (!Number.isInteger(value) || value < 0 || value > max) return false;
  return value === 0 ? null : value;
}

async function createRoleMenuGroup(
  interaction: ModalSubmitInteraction,
  services: HubServices,
  guildId: string,
  page: number,
): Promise<void> {
  const name = interaction.fields.getTextInputValue("name").trim();
  const description =
    interaction.fields.getTextInputValue("description").trim() || null;
  const mode = parseMode(interaction.fields.getTextInputValue("mode"));
  const max = parseOptionalLimit(
    interaction.fields.getTextInputValue("max"),
    25,
  );
  const temp = parseOptionalLimit(
    interaction.fields.getTextInputValue("temp"),
    MaxTempDurationSeconds,
  );
  if (name.length === 0) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Invalid Name", "The name cannot be empty.")),
    );
    return;
  }
  if (!mode) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Invalid Mode", "Mode must be `single` or `multiple`."),
      ),
    );
    return;
  }
  if (max === false || temp === false) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Settings",
          `Max selections must be 0-25; temp duration must be 0-${MaxTempDurationSeconds}.`,
        ),
      ),
    );
    return;
  }
  const conflict = await services.helpers.roleMenus.findGroupNameConflict(
    guildId,
    name,
  );
  if (conflict) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Name Taken", `A role menu named **${name}** already exists.`),
      ),
    );
    return;
  }
  const config = await getRoleMenusConfig(moduleServices(services), guildId);
  try {
    await services.helpers.roleMenus.createGroup({
      guildId,
      name,
      description,
      mode,
      requireOne: config.defaultRequireOne,
      autoToggle: config.defaultAutoToggle,
      maxSelections: max,
      tempDurationSeconds: temp,
    });
  } catch {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Create Failed",
          "I could not create that role menu. The name may already be in use.",
        ),
      ),
    );
    return;
  }
  await replyOrUpdate(
    interaction,
    await renderRoleMenusPanel(
      interaction,
      services,
      page,
      `✅ Created **${name}**.`,
    ),
  );
}

async function editRoleMenuGroup(
  interaction: ModalSubmitInteraction,
  services: HubServices,
  guildId: string,
  group: GroupRecord,
  page: number,
): Promise<void> {
  const name = interaction.fields.getTextInputValue("name").trim();
  const description =
    interaction.fields.getTextInputValue("description").trim() || null;
  const mode = parseMode(interaction.fields.getTextInputValue("mode"));
  const max = parseOptionalLimit(
    interaction.fields.getTextInputValue("max"),
    25,
  );
  const temp = parseOptionalLimit(
    interaction.fields.getTextInputValue("temp"),
    MaxTempDurationSeconds,
  );
  if (name.length === 0) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Invalid Name", "The name cannot be empty.")),
    );
    return;
  }
  if (!mode) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Invalid Mode", "Mode must be `single` or `multiple`."),
      ),
    );
    return;
  }
  if (max === false || temp === false) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Settings",
          `Max selections must be 0-25; temp duration must be 0-${MaxTempDurationSeconds}.`,
        ),
      ),
    );
    return;
  }
  const conflict = await services.helpers.roleMenus.findGroupNameConflict(
    guildId,
    name,
    group.id,
  );
  if (conflict) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Name Taken", `A role menu named **${name}** already exists.`),
      ),
    );
    return;
  }
  await services.helpers.roleMenus.updateGroup(group.id, {
    name,
    description,
    mode,
    maxSelections: max,
    tempDurationSeconds: temp,
  });
  await replyOrUpdate(
    interaction,
    await renderRoleMenuGroup(
      interaction,
      services,
      group.id,
      page,
      "✅ Settings updated.",
    ),
  );
}

/* ------------------------------- Actions -------------------------------- */

export async function handleRolesModuleAction(
  interaction: PanelInteraction,
  services: HubServices,
  guildId: string,
  action: string,
  target: string,
  extra: string,
  extra2: string,
): Promise<boolean> {
  if (action === "autorole") {
    await showPanel(interaction, () =>
      renderAutorolePanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (action === "voiceroles") {
    await showPanel(interaction, () =>
      renderVoiceRolesPanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (action === "rolemenus") {
    await showPanel(interaction, () =>
      renderRoleMenusPanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (action.startsWith("ar")) {
    switch (action) {
      case "aroles": {
        if (!interaction.isRoleSelectMenu()) return true;
        const config = await getAutoroleConfig(moduleServices(services), guildId);
        config.roleIds = [...interaction.values];
        await saveAutoroleConfig(moduleServices(services), guildId, config);
        await showPanel(interaction, () =>
          renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            "✅ Autoroles updated.",
          ),
        );
        return true;
      }
      case "ardelay": {
        if (!interaction.isButton()) return true;
        const config = await getAutoroleConfig(moduleServices(services), guildId);
        await interaction.showModal(
          autoroleDelayModal(config, pageNumber(target)),
        );
        return true;
      }
      case "arfilters": {
        await showPanel(interaction, () =>
          renderAutoroleFilters(
            interaction,
            services,
            pageNumber(target),
          ),
        );
        return true;
      }
      case "arage": {
        if (!interaction.isButton()) return true;
        const config = await getAutoroleConfig(moduleServices(services), guildId);
        await interaction.showModal(
          autoroleAgeModal(config, pageNumber(target)),
        );
        return true;
      }
      case "arrequired":
      case "arignored": {
        if (!interaction.isRoleSelectMenu()) return true;
        const config = await getAutoroleConfig(moduleServices(services), guildId);
        if (action === "arrequired") config.requiredRoleIds = [...interaction.values];
        else config.ignoredRoleIds = [...interaction.values];
        await saveAutoroleConfig(moduleServices(services), guildId, config);
        await showPanel(interaction, () =>
          renderAutoroleFilters(
            interaction,
            services,
            pageNumber(target),
            "✅ Filters updated.",
          ),
        );
        return true;
      }
      case "arignorebots":
      case "aronlyjoin": {
        if (!interaction.isButton()) return true;
        const config = await getAutoroleConfig(moduleServices(services), guildId);
        if (action === "arignorebots") config.ignoreBots = !config.ignoreBots;
        else config.onlyOnJoin = !config.onlyOnJoin;
        await saveAutoroleConfig(moduleServices(services), guildId, config);
        await showPanel(interaction, () =>
          renderAutoroleFilters(
            interaction,
            services,
            pageNumber(target),
            "✅ Filters updated.",
          ),
        );
        return true;
      }
      case "arrun": {
        if (!interaction.isButton()) return true;
        await interaction.deferUpdate();
        const result = await processPendingAutoroles(
          moduleServices(services),
          { guildId, force: true },
        );
        await interaction.editReply(
          await renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            `✅ Processed ${result.processed}; failed ${result.failed}.`,
          ),
        );
        return true;
      }
      case "arpause": {
        if (!interaction.isButton()) return true;
        const config = await getAutoroleConfig(moduleServices(services), guildId);
        config.paused = !config.paused;
        await saveAutoroleConfig(moduleServices(services), guildId, config);
        await showPanel(interaction, () =>
          renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            config.paused ? "⏸️ Queue paused." : "▶️ Queue resumed.",
          ),
        );
        return true;
      }
      case "arcancel": {
        if (!interaction.isButton()) return true;
        const cancelled = await cancelPendingAutoroles(
          moduleServices(services),
          guildId,
        );
        await showPanel(interaction, () =>
          renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            `🗑️ Cancelled ${cancelled} pending ${cancelled === 1 ? "entry" : "entries"}.`,
          ),
        );
        return true;
      }
      case "arqueue": {
        if (!interaction.isUserSelectMenu()) return true;
        const userId = interaction.values[0];
        const guild = interaction.guild;
        if (!userId || !guild) return true;
        const member = await fetchMember(guild, userId);
        if (!member) {
          await renderAutoroleNotice(
            interaction,
            services,
            "❌ That member is not in this server.",
          );
          return true;
        }
        const module = moduleServices(services);
        const config = await getAutoroleConfig(module, guildId);
        const decision = evaluateAutoroleCandidate(
          {
            isBot: member.user.bot,
            accountAgeMs: Date.now() - member.user.createdTimestamp,
            roleIds: [...member.roles.cache.keys()],
            isJoin: false,
          },
          config,
        );
        if (!decision.eligible) {
          await renderAutoroleNotice(
            interaction,
            services,
            `❌ Not eligible: ${decision.reason}`,
          );
          return true;
        }
        const roleIds = selectRolesToAssign(config.roleIds, [
          ...member.roles.cache.keys(),
        ]);
        await enqueueAutorole(module, {
          guildId,
          userId,
          roleIds,
          delaySeconds: 0,
        });
        const result = await processPendingAutoroles(module, {
          guildId,
          userId,
          force: true,
        });
        await showPanel(interaction, () =>
          renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            `✅ Queued <@${userId}> — processed ${result.processed}, failed ${result.failed}.`,
          ),
        );
        return true;
      }
      default:
        return false;
    }
  }

  if (action.startsWith("vr")) {
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
        const config = await getVoiceRolesConfig(moduleServices(services), guildId);
        await upsertVoiceRoleMapping(moduleServices(services), {
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
          renderVoiceRolesPanel(
            interaction,
            services,
            pageNumber(target),
          ),
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
          moduleServices(services),
          guildId,
          target,
        );
        if (!mapping) return true;
        await upsertVoiceRoleMapping(moduleServices(services), {
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
          moduleServices(services),
          guildId,
          target,
        );
        if (!mapping) return true;
        await setVoiceRoleEnabled(
          moduleServices(services),
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
          moduleServices(services),
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
          moduleServices(services),
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

  if (action.startsWith("rm")) {
    switch (action) {
      case "rmpage": {
        await showPanel(interaction, () =>
          renderRoleMenusPanel(
            interaction,
            services,
            pageNumber(target),
          ),
        );
        return true;
      }
      case "rmpick": {
        if (!interaction.isStringSelectMenu()) return true;
        const groupId = interaction.values[0];
        if (!groupId) return true;
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            groupId,
            pageNumber(target),
          ),
        );
        return true;
      }
      case "rm": {
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            target,
            pageNumber(extra),
          ),
        );
        return true;
      }
      case "rmcreate": {
        if (!interaction.isButton()) return true;
        await interaction.showModal(roleMenuCreateModal(pageNumber(target)));
        return true;
      }
      case "rmedit": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        await interaction.showModal(
          roleMenuEditModal(group, pageNumber(extra)),
        );
        return true;
      }
      case "rmaddrole": {
        if (!interaction.isRoleSelectMenu()) return true;
        const roleId = interaction.values[0];
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group || !roleId) return true;
        const role =
          interaction.guild?.roles.cache.get(roleId) ??
          (await interaction.guild?.roles.fetch(roleId).catch(() => null));
        const me = interaction.guild?.members.me;
        const problem =
          !role
            ? "That role no longer exists."
            : role.id === guildId
              ? "The @everyone role cannot be a menu option."
              : role.managed
                ? "Integration-managed roles cannot be assigned by role menus."
                : !me?.permissions.has(PermissionFlagsBits.ManageRoles)
                  ? "I need the **Manage Roles** permission to assign menu roles."
                  : role.position >= (me?.roles.highest.position ?? 0)
                    ? "That role is above or equal to my highest role."
                    : group.options.some((option) => option.roleId === role.id)
                      ? "That role is already an option in this group."
                      : null;
        if (problem || !role) {
          await showPanel(interaction, () =>
            renderRoleMenuGroup(
              interaction,
              services,
              group.id,
              pageNumber(extra),
              `❌ ${problem ?? "That role is unavailable."}`,
            ),
          );
          return true;
        }
        const config = await getRoleMenusConfig(
          moduleServices(services),
          guildId,
        );
        if (group.options.length >= config.maxOptionsPerGroup) {
          await showPanel(interaction, () =>
            renderRoleMenuGroup(
              interaction,
              services,
              group.id,
              pageNumber(extra),
              `❌ This server allows at most ${config.maxOptionsPerGroup} options per group.`,
            ),
          );
          return true;
        }
        const position =
          group.options.reduce(
            (highest, option) => Math.max(highest, option.position),
            -1,
          ) + 1;
        await services.helpers.roleMenus.createOption({
          groupId: group.id,
          roleId: role.id,
          label: role.name.slice(0, 80),
          emoji: null,
          description: null,
          position,
        });
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            group.id,
            pageNumber(extra),
            `✅ Added <@&${role.id}>.`,
          ),
        );
        return true;
      }
      case "rmdelopt": {
        if (!interaction.isStringSelectMenu()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        const removed = new Set(interaction.values);
        const options = group.options.filter((option) =>
          removed.has(option.id),
        );
        for (const option of options) {
          await services.helpers.roleMenus.deleteOption(option.id);
          await services.helpers.roleMenus
            .deleteTempRolesForRole(group.guildId, option.roleId)
            .catch(() => undefined);
        }
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            group.id,
            pageNumber(extra),
            `🗑️ Removed ${options.length} option${options.length === 1 ? "" : "s"}.`,
          ),
        );
        return true;
      }
      case "rmtoggle": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        const field = extra === "requireOne" ? "requireOne" : "autoToggle";
        const current = field === "requireOne" ? group.requireOne : group.autoToggle;
        await services.helpers.roleMenus.updateGroup(group.id, {
          [field]: !current,
        });
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            group.id,
            pageNumber(extra2),
            `✅ ${field === "requireOne" ? "Require one" : "Auto toggle"} ${!current ? "enabled" : "disabled"}.`,
          ),
        );
        return true;
      }
      case "rmrefresh": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        const messages = await services.helpers.roleMenus.listGroupMessages(
          group.id,
        );
        let refreshed = 0;
        let deleted = 0;
        let skipped = 0;
        for (const message of messages) {
          const outcome = await refreshRoleMenuMessage(
            moduleServices(services),
            interaction.guild!,
            group,
            group.options,
            message,
          );
          if (outcome === "refreshed") refreshed += 1;
          else if (outcome === "deleted") deleted += 1;
          else skipped += 1;
        }
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            group.id,
            pageNumber(extra),
            `🔄 Refreshed ${refreshed}; deleted ${deleted}; skipped ${skipped}.`,
          ),
        );
        return true;
      }
      case "rmdelete": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        await showPanel(interaction, () =>
          renderRoleMenuDelete(interaction, services, group, pageNumber(extra)),
        );
        return true;
      }
      case "rmdelconfirm": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        const deleted = await deleteGroup(services, group);
        await showPanel(interaction, () =>
          renderRoleMenusPanel(
            interaction,
            services,
            pageNumber(extra),
            `🗑️ Deleted **${group.name}** and ${deleted} posted menu${deleted === 1 ? "" : "s"}.`,
          ),
        );
        return true;
      }
      case "rmpost": {
        if (!interaction.isButton()) return true;
        await showPanel(interaction, () =>
          renderRoleMenuPost(
            interaction,
            services,
            target,
            pageNumber(extra),
          ),
        );
        return true;
      }
      case "rmpoststyle": {
        if (!interaction.isStringSelectMenu()) return true;
        const style = interaction.values[0] as RoleMenuStyle;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        await showPanel(interaction, () =>
          postCard(
            interaction,
            services,
            ["Role Menus", group.name, "Post"],
            [
              row(
                createChannelSelectMenu({
                  customId: `lumi:rmpostchan:${group.id}:${style}:${pageNumber(extra)}`,
                  placeholder: "Choose the channel to post in…",
                  channelTypes: [
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement,
                  ],
                  minValues: 1,
                  maxValues: 1,
                }),
              ),
              row(
                backButton(
                  `lumi:rmpost:${group.id}:${pageNumber(extra2)}`,
                  "Cancel",
                ),
              ),
            ],
            "📣 Post Role Menu",
            [
              `**Style**\n${styleLabel(style)}`,
              `**Options**\n${group.options.length}`,
              "-# Choose a channel to publish the menu.",
            ],
          ),
        );
        return true;
      }
      case "rmpostchan": {
        if (!interaction.isChannelSelectMenu()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        const channelId = interaction.values[0];
        const style = extra as RoleMenuStyle;
        if (!group || !channelId) return true;
        const channel = await guildChannel(interaction.guild ?? null, channelId);
        if (!channel?.isTextBased() || !("send" in channel)) {
          await showPanel(interaction, () =>
            renderRoleMenuPost(
              interaction,
              services,
              group.id,
              pageNumber(extra2),
              "❌ I cannot send messages in that channel.",
            ),
          );
          return true;
        }
        if (group.options.length > MaxReactionOptions && style === "reactions") {
          await showPanel(interaction, () =>
            renderRoleMenuPost(
              interaction,
              services,
              group.id,
              pageNumber(extra2),
              `❌ Reaction menus support at most ${MaxReactionOptions} options.`,
            ),
          );
          return true;
        }
        const card = await postGroup(
          interaction,
          services,
          group,
          style,
          channel as unknown as SendableChannel,
        );
        await showPanel(interaction, async () => card);
        return true;
      }
      case "rmmodalcreate":
      case "rmmodaledit":
        return false;
      default:
        return false;
    }
  }

  return false;
}

export async function handleRolesModuleModal(
  interaction: ModalSubmitInteraction,
  services: HubServices,
  guildId: string,
  parts: string[],
): Promise<boolean> {
  const action = parts[1];
  if (action === "armodaldelay") {
    const config = await getAutoroleConfig(moduleServices(services), guildId);
    const raw = interaction.fields.getTextInputValue("seconds").trim();
    const seconds = Number(raw);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 604800) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Delay",
            "Enter a whole number from 0 to 604800 seconds.",
          ),
        ),
      );
      return true;
    }
    config.delaySeconds = seconds;
    await saveAutoroleConfig(moduleServices(services), guildId, config);
    await replyOrUpdate(
      interaction,
      await renderAutorolePanel(
        interaction,
        services,
        pageNumber(parts[2]),
        `⏱️ Delay set to ${seconds}s.`,
      ),
    );
    return true;
  }

  if (action === "armodalage") {
    const config = await getAutoroleConfig(moduleServices(services), guildId);
    const raw = interaction.fields.getTextInputValue("hours").trim();
    const hours = Number(raw);
    if (!Number.isInteger(hours) || hours < 0 || hours > 8760) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Account Age",
            "Enter a whole number from 0 to 8760 hours.",
          ),
        ),
      );
      return true;
    }
    config.minAccountAgeHours = hours;
    await saveAutoroleConfig(moduleServices(services), guildId, config);
    await replyOrUpdate(
      interaction,
      await renderAutoroleFilters(
        interaction,
        services,
        pageNumber(parts[2]),
        `🕒 Minimum account age set to ${hours}h.`,
      ),
    );
    return true;
  }

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
        ephemeralCard(makeErrorCard("Mapping Missing", "That mapping no longer exists.")),
      );
      return true;
    }
    const mapping = await getVoiceRoleMapping(
      moduleServices(services),
      guildId,
      channelId,
    );
    if (!mapping) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Mapping Missing", "That mapping no longer exists.")),
      );
      return true;
    }
    await upsertVoiceRoleMapping(moduleServices(services), {
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

  if (action === "rmmodalcreate") {
    await createRoleMenuGroup(
      interaction,
      services,
      guildId,
      pageNumber(parts[2]),
    );
    return true;
  }

  if (action === "rmmodaledit") {
    const groupId = parts[2];
    const group = await services.helpers.roleMenus.findGroupById(
      guildId,
      groupId,
    );
    if (!group) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Role Menu Missing", "That group no longer exists."),
        ),
      );
      return true;
    }
    await editRoleMenuGroup(
      interaction,
      services,
      guildId,
      group,
      pageNumber(parts[3]),
    );
    return true;
  }

  return false;
}
