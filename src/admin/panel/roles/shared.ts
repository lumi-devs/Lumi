import {
  type CardReply,
  createActionButton,
  ephemeralCard,
  makeCard,
} from "@lumi/ui";
import {
  type ActionRowBuilder,
  ButtonStyle,
  type Guild,
  type GuildBasedChannel,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  backButton,
  type HubInteraction,
  type MessageModalSubmit,
  panelOptions,
} from "../common.js";
import type { BotServices } from "../../../core/contracts.js";

export const AutoroleModuleName = "autorole";
export const VoiceRolesModuleName = "voiceroles";
export const RoleMenusModuleName = "role-menus";

export const MaxRoleOptions = 25;
export const MaxGroupOptions = 20;
export const MaxReactionOptions = 20;

export function pageNumber(raw: string | undefined): number {
  return Number(raw) || 0;
}

export function roleMentions(roleIds: readonly string[]): string {
  return roleIds.length > 0
    ? roleIds.map((roleId) => `<@&${roleId}>`).join(", ")
    : "*none*";
}

export function booleanLabel(value: boolean): string {
  return value ? "On" : "Off";
}

export function styleLabel(style: string): string {
  return style === "reactions"
    ? "Reactions"
    : style === "select"
      ? "Select menu"
      : "Buttons";
}

export function isSnowflake(value: string | undefined): value is string {
  return Boolean(value && /^\d{15,22}$/.test(value));
}

export async function guildChannel(
  guild: Guild | null,
  channelId: string,
): Promise<GuildBasedChannel | null> {
  if (!guild) return null;
  return (
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

export async function channelLabel(
  guild: Guild | null,
  channelId: string,
): Promise<string> {
  const channel = await guildChannel(guild, channelId);
  return channel ? `<#${channel.id}>` : `<#${channelId}>`;
}

export async function replyOrUpdate(
  interaction: ModalSubmitInteraction,
  card: CardReply,
): Promise<void> {
  if (interaction.isFromMessage()) {
    await (interaction as MessageModalSubmit).update(card);
  } else {
    await interaction.reply(ephemeralCard(card));
  }
}

export function moduleBackButton(moduleName: string, page: number) {
  return backButton(`lumi:modopen:${moduleName}:${page}`);
}

export function pageItems<T>(items: readonly T[], page: number): readonly T[] {
  const start = Math.max(0, page) * MaxRoleOptions;
  return items.slice(start, start + MaxRoleOptions);
}

export function pageTotal(total: number): number {
  return Math.max(1, Math.ceil(total / MaxRoleOptions));
}

export function pageButtons(action: string, page: number, totalPages: number) {
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

export async function postCard(
  interaction: HubInteraction,
  _services: BotServices,
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
