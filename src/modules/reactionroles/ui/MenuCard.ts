import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from "@discordjs/builders";
import { ButtonStyle, MessageFlags, roleMention } from "discord.js";
import { ReactionRolePickId, ReactionRoleSelectId } from "#src/modules/reactionroles/Constants.js";
import type { ReactionRoleMenu, ReactionRoleOption } from "#src/modules/reactionroles/data/Reactionroles.js";
import { parseHexColor } from "#src/lib/utilities/MessageContent.js";
import { makeCard, type CardReply } from "#src/lib/ui/Cards.js";
import {
  buildSafeActionRows,
  createActionButton,
  createStringSelectMenu,
} from "#src/lib/ui/Panels.js";
import { renderMessageBlocksV2Container } from "#src/lib/utilities/MessageBlocksV2.js";

function safeEmoji(emoji: string | null) {
  return emoji || undefined;
}

function optionLine(option: ReactionRoleOption): string {
  const emoji = option.emoji ? `${option.emoji} ` : "";
  const label = `**${option.label}**`;
  const role = roleMention(option.roleId);
  const description = option.description ? ` - ${option.description}` : "";
  const gate = option.requiredRoleId
    ? ` (requires ${roleMention(option.requiredRoleId)})`
    : "";
  return `${emoji}${label} → ${role}${description}${gate}`;
}

function menuModeBadge(menu: ReactionRoleMenu): string {
  const parts: string[] = [];
  if (menu.mode === "buttons") parts.push("Buttons");
  else if (menu.mode === "select") parts.push("Dropdown");
  else parts.push("Reactions");
  if (menu.exclusive) parts.push("Pick one");
  else if (menu.maxRoles > 1) parts.push(`Up to ${menu.maxRoles}`);
  return parts.join(" · ");
}

export function buildMenuCard(menu: ReactionRoleMenu): CardReply {
  const header = menu.description?.trim() || "Pick your roles below.";
  const body = [header, "", ...menu.options.map(optionLine)];
  if (menu.mode === "reactions") {
    body.push("", "-# React to this message to claim a role. Remove your reaction to give it back.");
  } else if (menu.exclusive) {
    body.push("", "-# This menu allows a single role - picking a new one replaces the old one.");
  } else if (menu.maxRoles > 1) {
    body.push("", `-# You can hold up to ${menu.maxRoles} roles from this menu.`);
  }

  const buttonRows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (menu.mode === "buttons") {
    const buttons = menu.options.map((option) =>
      createActionButton({
        customId: ReactionRolePickId.build({ menuId: menu.id, optionId: option.id }),
        label: option.label.slice(0, 80),
        style: ButtonStyle.Secondary,
        emoji: safeEmoji(option.emoji),
      }),
    );
    for (let i = 0; i < buttons.length; i += 5) {
      buttonRows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...buttons.slice(i, i + 5),
        ),
      );
    }
  }
  const selectRows =
    menu.mode === "select"
      ? [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            createStringSelectMenu({
              customId: ReactionRoleSelectId.build({ menuId: menu.id }),
              placeholder: "Choose your roles…",
              minValues: 0,
              maxValues: Math.min(Math.max(menu.options.length, 1), 25),
              options: menu.options.map((option) => ({
                label: option.label.slice(0, 100),
                value: option.id,
                description: option.description?.slice(0, 100),
                emoji: safeEmoji(option.emoji),
              })),
            }),
          ),
        ]
      : [];

  const rows = buildSafeActionRows([...buttonRows, ...selectRows]);

  if (menu.richContent.blocks.length > 0) {

    const container = renderMessageBlocksV2Container(menu.richContent);
    for (const option of menu.options) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(optionLine(option)));
    }
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${menuModeBadge(menu)}`),
    );
    if (rows.length > 0) container.addActionRowComponents(...rows);
    return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
  }

  return makeCard(parseHexColor(menu.color), menu.title, body, {
    footer: menuModeBadge(menu),
    actionRows: rows.length > 0 ? rows : undefined,
  });
}
