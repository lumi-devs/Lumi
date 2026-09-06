import {
  ActionRowBuilder,
  ButtonBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  ChannelType,
  TextInputStyle,
  roleMention,
} from "discord.js";
import { Rr } from "../keys.js";
import type {
  ReactionRoleMenu,
  ReactionRoleOption,
} from "../data.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  type CardReply,
} from "#utilities/cards.js";
import {
  buildSafeActionRows,
  createActionButton,
  createBackButton,
  createChannelSelectMenu,
  createStringSelectMenu,
} from "#utilities/panels.js";

export function buildMenuListCard(menus: ReactionRoleMenu[]): CardReply {
  const lines =
    menus.length === 0
      ? ["No role menus yet. Create the first one below."]
      : menus.map(
          (m) =>
            `**${m.title}** (\`${m.id}\`) — ${m.mode} · ${m.options.length} option(s)${m.exclusive ? " · exclusive" : ""}`,
        );
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (menus.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        createStringSelectMenu({
          customId: `${Rr}:menupick`,
          placeholder: "Manage a menu…",
          options: menus.slice(0, 25).map((m) => ({
            label: m.title.slice(0, 100),
            value: m.id,
            description: `${m.mode} · ${m.options.length} options`.slice(0, 100),
            emoji: "🎭",
          })),
        }),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      createActionButton({
        customId: `${Rr}:new`,
        label: "New Menu",
        style: ButtonStyle.Primary,
        emoji: "➕",
      }),
    ),
  );
  return makeInfoCard("🎭 Role Menus", lines, {
    footer: "Pick a menu to edit its options, or create a new one.",
    actionRows: buildSafeActionRows(rows),
  });
}

function settingsLines(menu: ReactionRoleMenu): string[] {
  const modeLabel =
    menu.mode === "buttons" ? "Buttons" : menu.mode === "select" ? "Dropdown" : "Reactions";
  return [
    `**Mode:** ${modeLabel}`,
    `**Exclusive:** ${menu.exclusive ? "Yes — one role per member" : "No"}`,
    `**Max roles:** ${menu.exclusive ? "1 (exclusive)" : String(menu.maxRoles)}`,
    `**Color:** ${menu.color ?? "default"}`,
    `**Posted messages:** ${menu.messageIds.length > 0 ? String(menu.messageIds.length) : "never posted"}`,
  ];
}

function optionLines(menu: ReactionRoleMenu): string[] {
  if (menu.options.length === 0) {
    return ["-# *No options yet — add the first one below.*"];
  }
  return menu.options.map((o) => {
    const gate = o.requiredRoleId ? ` (requires ${roleMention(o.requiredRoleId)})` : "";
    const emoji = o.emoji ? `${o.emoji} ` : "";
    return `${emoji}**${o.label}** → ${roleMention(o.roleId)}${gate}`;
  });
}

export function buildMenuDetailCard(menu: ReactionRoleMenu): CardReply {
  const body = [
    menu.description?.trim() || "-# *No description.*",
    "",
    ...settingsLines(menu),
    "",
    "**Options**",
    ...optionLines(menu),
  ];
  const modeSelect = createStringSelectMenu({
    customId: `${Rr}:modeset:${menu.id}`,
    placeholder: "Change mode…",
    options: [
      { label: "Buttons", value: "buttons", emoji: "🔘" },
      { label: "Dropdown", value: "select", emoji: "📋" },
      { label: "Reactions", value: "reactions", emoji: "⭐" },
    ],
  });
  const optionSelect = createStringSelectMenu({
    customId: `${Rr}:optpick:${menu.id}`,
    placeholder:
      menu.options.length > 0 ? "Edit or remove an option…" : "No options to edit yet",
    disabled: menu.options.length === 0,
    options:
      menu.options.length > 0
        ? menu.options.slice(0, 25).map((o) => ({
            label: o.label.slice(0, 100),
            value: o.id,
            description: `Edit or remove`.slice(0, 100),
            emoji: o.emoji?.slice(0, 100),
          }))
        : [{ label: "No options", value: "none" }],
  });
  const postChannel = createChannelSelectMenu({
    customId: `${Rr}:postchan:${menu.id}`,
    placeholder: "Post this menu in a channel…",
    channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    minValues: 1,
    maxValues: 1,
  });
  const rows = buildSafeActionRows([
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(modeSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(optionSelect),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      createActionButton({
        customId: `${Rr}:optadd:${menu.id}`,
        label: "Add Option",
        style: ButtonStyle.Primary,
        emoji: "➕",
      }),
      createActionButton({
        customId: `${Rr}:excl:${menu.id}`,
        label: menu.exclusive ? "Exclusive: On" : "Exclusive: Off",
        style: menu.exclusive ? ButtonStyle.Success : ButtonStyle.Secondary,
        emoji: "🔒",
      }),
      createActionButton({
        customId: `${Rr}:maxroles:${menu.id}`,
        label: "Max Roles",
        style: ButtonStyle.Secondary,
        emoji: "🔢",
      }),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      createActionButton({
        customId: `${Rr}:menuedit:${menu.id}`,
        label: "Edit Details",
        style: ButtonStyle.Secondary,
        emoji: "✏️",
      }),
      createActionButton({
        customId: `${Rr}:del:${menu.id}`,
        label: "Delete",
        style: ButtonStyle.Danger,
        emoji: "🗑️",
      }),
      createBackButton(`${Rr}:list`, "← All Menus"),
    ),
    new ActionRowBuilder().addComponents(postChannel),
  ]);
  return makeInfoCard(`🎭 ${menu.title}`, body, {
    footer: `Menu \`${menu.id}\` — post it with the channel picker below.`,
    actionRows: rows,
  });
}

export function buildOptionDetailCard(
  menu: ReactionRoleMenu,
  option: ReactionRoleOption,
): CardReply {
  const body = [
    `**Label:** ${option.label}`,
    `**Role:** ${roleMention(option.roleId)}`,
    `**Emoji:** ${option.emoji ?? "—"}`,
    `**Description:** ${option.description ?? "—"}`,
    `**Requires:** ${option.requiredRoleId ? roleMention(option.requiredRoleId) : "—"}`,
  ];
  const rows = buildSafeActionRows([
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      createActionButton({
        customId: `${Rr}:optedit:${menu.id}:${option.id}`,
        label: "Edit",
        style: ButtonStyle.Primary,
        emoji: "✏️",
      }),
      createActionButton({
        customId: `${Rr}:optremove:${menu.id}:${option.id}`,
        label: "Remove",
        style: ButtonStyle.Danger,
        emoji: "🗑️",
      }),
      createBackButton(`${Rr}:backmenu:${menu.id}`, "← Back to Menu"),
    ),
  ]);
  return makeInfoCard(`🎭 ${menu.title} — ${option.label}`, body, {
    footer: `Option \`${option.id}\` on menu \`${menu.id}\`.`,
    actionRows: rows,
  });
}

export function buildDeleteConfirmCard(menu: ReactionRoleMenu): CardReply {
  const rows = buildSafeActionRows([
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      createActionButton({
        customId: `${Rr}:delyes:${menu.id}`,
        label: "Confirm Delete",
        style: ButtonStyle.Danger,
      }),
      createBackButton(`${Rr}:backmenu:${menu.id}`, "← Keep Menu"),
    ),
  ]);
  return makeErrorCard(
    `🗑️ Delete “${menu.title}”?`,
    "The menu definition is removed. Already-posted menu messages keep working until removed — repost to refresh them.",
    { actionRows: rows },
  );
}

export function buildOptionRemoveConfirmCard(
  menu: ReactionRoleMenu,
  option: ReactionRoleOption,
): CardReply {
  const rows = buildSafeActionRows([
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      createActionButton({
        customId: `${Rr}:optremoveyes:${menu.id}:${option.id}`,
        label: "Confirm Remove",
        style: ButtonStyle.Danger,
      }),
      createBackButton(`${Rr}:backmenu:${menu.id}`, "← Keep Option"),
    ),
  ]);
  return makeErrorCard(
    `🗑️ Remove “${option.label}”?`,
    `Members keep roles they already claimed. The option disappears from menu **${menu.title}**.`,
    { actionRows: rows },
  );
}

export function buildMenuCreatedCard(menu: ReactionRoleMenu): CardReply {
  return makeSuccessCard(
    "Menu created",
    `**${menu.title}** (\`${menu.id}\`) is ready. Add options, then post it.`,
    { actionRows: buildSafeActionRows([]) },
  );
}

export function buildMenuPreviewCard(menu: ReactionRoleMenu): CardReply {
  const body = [
    menu.description?.trim() || "-# *No description.*",
    "",
    ...optionLines(menu),
  ];
  return makeInfoCard(`🎭 ${menu.title} — Preview`, body, {
    footer: "Preview only — post the menu to make it live.",
  });
}

export function buildNewMenuModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${Rr}:modal:new`)
    .setTitle("New Role Menu")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Title")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("Accent color hex, e.g. #5865F2 (optional)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setRequired(false),
      ),
    );
}

export function buildMenuEditModal(menu: ReactionRoleMenu): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${Rr}:modal:menuedit:${menu.id}`)
    .setTitle("Edit Menu Details")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Title")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(menu.title)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setValue(menu.description ?? "")
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("Accent color hex, e.g. #5865F2 (optional)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setValue(menu.color ?? "")
          .setRequired(false),
      ),
    );
}

export function buildOptionModal(
  menuId: string,
  option?: ReactionRoleOption,
): ModalBuilder {
  const isEdit = option !== undefined;
  return new ModalBuilder()
    .setCustomId(
      isEdit ? `${Rr}:modal:optedit:${menuId}:${option.id}` : `${Rr}:modal:optadd:${menuId}`,
    )
    .setTitle(isEdit ? "Edit Option" : "Add Option")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("label")
          .setLabel("Label")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setValue(option?.label ?? "")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("roleId")
          .setLabel("Granted role ID")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(20)
          .setValue(option?.roleId ?? "")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji")
          .setLabel("Emoji (optional)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(option?.emoji ?? "")
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (optional)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(option?.description ?? "")
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("requiredRoleId")
          .setLabel("Required role ID (optional)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(20)
          .setValue(option?.requiredRoleId ?? "")
          .setRequired(false),
      ),
    );
}

export function buildMaxRolesModal(menu: ReactionRoleMenu): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${Rr}:modal:maxroles:${menu.id}`)
    .setTitle("Max Roles Per Member")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("maxRoles")
          .setLabel("Max roles (1–25)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setValue(String(menu.maxRoles))
          .setRequired(true),
      ),
    );
}
