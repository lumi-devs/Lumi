import {
  type CardReply,
  createActionButton,
  createChannelSelectMenu,
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
  ChannelType,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  getRoleMenusConfig,
  MaxTempDurationSeconds,
} from "./config.js";
import {
  deleteRoleMenuMessage,
  postRoleMenu,
  refreshRoleMenuMessage,
  type SendableChannel,
} from "./posting.js";
import { formatTempDuration } from "./selection.js";
import type { GroupRecord } from "./service.js";
import {
  groupMode,
  type RoleMenuStyle,
} from "./ui.js";
import {
  backButton,
  cut,
  type HubInteraction,
  type ModuleActionParams,
  type PanelInteraction,
  panelOptions,
  showPanel,
} from "../../../src/admin/panel/common.js";
import type { BotServices } from "../../../src/core/contracts.js";
import { servicesForModule } from "../../../src/core/modules.js";
import {
  MaxGroupOptions,
  MaxReactionOptions,
  MaxRoleOptions,
  RoleMenusModuleName,
  booleanLabel,
  guildChannel,
  moduleBackButton,
  pageButtons,
  pageItems,
  pageNumber,
  pageTotal,
  postCard,
  replyOrUpdate,
  styleLabel,
} from "../../../src/admin/panel/roles/shared.js";

export { RoleMenusModuleName } from "../../../src/admin/panel/roles/shared.js";

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
  const group = await services.helpers.roleMenus.findGroupById(
    guildId,
    groupId,
  );
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

  const optionLines = group.options.slice(0, MaxGroupOptions).map((option) => {
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
  const group = await services.helpers.roleMenus.findGroupById(
    guildId,
    groupId,
  );
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
        makeErrorCard(
          "Name Taken",
          `A role menu named **${name}** already exists.`,
        ),
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
        makeErrorCard(
          "Name Taken",
          `A role menu named **${name}** already exists.`,
        ),
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

export async function handleRoleMenusAction(
  interaction: PanelInteraction,
  services: BotServices,
  params: ModuleActionParams,
): Promise<boolean> {
  const { guildId, action, target, extra, extra2 } = params;
  if (action === "rolemenus") {
    await showPanel(interaction, () =>
      renderRoleMenusPanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (action.startsWith("rm")) {
    switch (action) {
      case "rmpage": {
        await showPanel(interaction, () =>
          renderRoleMenusPanel(interaction, services, pageNumber(target)),
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
          renderRoleMenuGroup(interaction, services, target, pageNumber(extra)),
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
        const problem = !role
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
          servicesForModule(services),
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
        const current =
          field === "requireOne" ? group.requireOne : group.autoToggle;
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
            servicesForModule(services),
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
          renderRoleMenuPost(interaction, services, target, pageNumber(extra)),
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
        const channel = await guildChannel(
          interaction.guild ?? null,
          channelId,
        );
        if (!channel?.isSendable()) {
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
        if (
          group.options.length > MaxReactionOptions &&
          style === "reactions"
        ) {
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
          channel,
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

export async function handleRoleMenusModal(
  interaction: ModalSubmitInteraction,
  services: BotServices,
  guildId: string,
  parts: string[],
): Promise<boolean> {
  const action = parts[1];
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
