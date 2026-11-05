import {
  type CardReply,
  createActionButton,
  createRoleSelectMenu,
  createStringSelectMenu,
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  getRoleMenusConfig,
  MaxTempDurationSeconds,
} from "../../../../modules/role-menus/menu/config.js";
import {
  deleteRoleMenuMessage,
  postRoleMenu,
  type SendableChannel,
} from "../../../../modules/role-menus/menu/posting.js";
import { formatTempDuration } from "../../../../modules/role-menus/menu/selection.js";
import type { GroupRecord } from "../../../../modules/role-menus/menu/service.js";
import {
  groupMode,
  type RoleMenuStyle,
} from "../../../../modules/role-menus/menu/ui.js";
import {
  backButton,
  cut,
  type HubInteraction,
  panelOptions,
} from "../common.js";
import type { BotServices } from "../../../core/contracts.js";
import { servicesForModule } from "../../../core/modules.js";
import {
  MaxGroupOptions,
  MaxRoleOptions,
  RoleMenusModuleName,
  booleanLabel,
  moduleBackButton,
  pageButtons,
  pageItems,
  pageTotal,
  postCard,
  replyOrUpdate,
  styleLabel,
} from "./shared.js";

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
  services: BotServices,
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

export function roleMenuCreateModal(page: number): ModalBuilder {
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

export function roleMenuEditModal(
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
  services: BotServices,
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
  services: BotServices,
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
  _services: BotServices,
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

export async function deleteGroup(
  services: BotServices,
  group: GroupRecord,
): Promise<number> {
  const messages = await services.helpers.roleMenus.listGroupMessageLocations(
    group.id,
  );
  const module = servicesForModule(services);
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

export async function postGroup(
  interaction: HubInteraction,
  services: BotServices,
  group: GroupRecord,
  style: RoleMenuStyle,
  channel: SendableChannel,
): Promise<CardReply> {
  const result = await postRoleMenu(
    servicesForModule(services),
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

export async function createRoleMenuGroup(
  interaction: ModalSubmitInteraction,
  services: BotServices,
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
  const config = await getRoleMenusConfig(servicesForModule(services), guildId);
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

export async function editRoleMenuGroup(
  interaction: ModalSubmitInteraction,
  services: BotServices,
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
