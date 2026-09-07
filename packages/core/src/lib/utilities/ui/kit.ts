import {
  ActionRowBuilder,
  ButtonBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "@discordjs/builders";
import { ButtonStyle, type APIMessageComponentEmoji } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { formatPageFooter } from "#lib/utilities/ui/layout.js";

export const SectionLineLimit = 3;

export const ButtonLabelLimit = 80;

export interface AccessoryButton {
  customId: string;
  label?: string;
  style?: ButtonStyle;
  emoji?: string | APIMessageComponentEmoji;
  disabled?: boolean;
}

export interface NavAction {
  customId: string;
  label: string;
  style?: ButtonStyle;
  emoji?: string | APIMessageComponentEmoji;
  disabled?: boolean;
}

export interface NavRowOptions {
  backId: string;
  backLabel?: string;
  action: NavAction;
}

export const clipLabel = (label: string): string =>
  label.length > ButtonLabelLimit ? label.slice(0, ButtonLabelLimit) : label;

const clipLines = (lines: string | string[]): string[] =>
  (Array.isArray(lines) ? lines : [lines]).slice(0, SectionLineLimit);

const toButton = (b: AccessoryButton): ButtonBuilder => {
  const button = new ButtonBuilder()
    .setCustomId(b.customId)
    .setStyle(b.style ?? ButtonStyle.Secondary);
  if (b.label) button.setLabel(clipLabel(b.label));
  if (b.emoji) {
    button.setEmoji(typeof b.emoji === "string" ? Emojis.parse(b.emoji) : b.emoji);
  }
  if (b.disabled !== undefined) button.setDisabled(b.disabled);
  return button;
};

/**
 * A "setting row": up to three text lines with an inline accessory button.
 * The core list-row primitive for panels — label + value + Edit/Toggle button.
 */
export function settingRow(
  lines: string | string[],
  button: AccessoryButton,
): SectionBuilder {
  const section = new SectionBuilder().setButtonAccessory(toButton(button));
  for (const line of clipLines(lines)) {
    section.addTextDisplayComponents(new TextDisplayBuilder().setContent(line));
  }
  return section;
}

/** Up to three text lines with a thumbnail accessory. */
export function thumbRow(
  lines: string | string[],
  imageUrl: string,
): SectionBuilder {
  const section = new SectionBuilder().setThumbnailAccessory(
    new ThumbnailBuilder().setURL(imageUrl),
  );
  for (const line of clipLines(lines)) {
    section.addTextDisplayComponents(new TextDisplayBuilder().setContent(line));
  }
  return section;
}

export interface Tab {
  id: string;
  label: string;
  emoji?: string;
}

/** Hub and detail tab set backing the Home/Modules/Permissions/Settings/Addons bar. */
export const HubTabs: readonly Tab[] = [
  { id: "home", label: "Hub", emoji: "🤖" },
  { id: "modules", label: "Modules", emoji: "⚙️" },
  { id: "permissions", label: "Permissions", emoji: "🛡️" },
  { id: "settings", label: "Settings", emoji: "🏰" },
  { id: "addons", label: "Addons", emoji: "📦" },
];

/**
 * Panel tab bar. The active tab renders as a disabled Primary button; the rest
 * are Secondary buttons with customId `<prefix>:<tab.id>`.
 */
export function tabRow(
  prefix: string,
  tabs: readonly Tab[],
  activeId: string,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const tab of tabs.slice(0, 5)) {
    const active = tab.id === activeId;
    const button = new ButtonBuilder()
      .setCustomId(`${prefix}:${tab.id}`)
      .setLabel(clipLabel(tab.label))
      .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(active);
    if (tab.emoji) button.setEmoji(Emojis.parse(tab.emoji));
    row.addComponents(button);
  }
  return row;
}

export interface ConfirmRowOptions {
  confirmId: string;
  cancelId: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: ButtonStyle;
}

/** Standard destructive-action confirmation pair: Danger confirm + Secondary cancel. */
export function confirmRow(
  options: ConfirmRowOptions,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(options.confirmId)
      .setLabel(clipLabel(options.confirmLabel ?? "Confirm"))
      .setStyle(options.confirmStyle ?? ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(options.cancelId)
      .setLabel(clipLabel(options.cancelLabel ?? "Cancel"))
      .setStyle(ButtonStyle.Secondary),
  );
}

/** A lone back button row for subpanels. */
export function backRow(
  customId: string,
  label = "← Back",
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(clipLabel(label))
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Detail-view navigation: a Back button plus one primary action.
 * Keeps subpanel footers uniform across hub, detail, and addon views.
 */
export function navRow(
  options: NavRowOptions,
): ActionRowBuilder<ButtonBuilder> {
  const action = new ButtonBuilder()
    .setCustomId(options.action.customId)
    .setLabel(clipLabel(options.action.label))
    .setStyle(options.action.style ?? ButtonStyle.Primary);
  if (options.action.emoji) {
    action.setEmoji(
      typeof options.action.emoji === "string"
        ? Emojis.parse(options.action.emoji)
        : options.action.emoji,
    );
  }
  if (options.action.disabled !== undefined) {
    action.setDisabled(options.action.disabled);
  }
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(options.backId)
      .setLabel(clipLabel(options.backLabel ?? "← Back"))
      .setStyle(ButtonStyle.Secondary),
    action,
  );
}

/** Small muted footer line for paged panels: `Page x of y` plus a hint. */
export function pageFooter(
  pageIndex: number,
  totalPages: number,
  hintOrTotalItems?: string | number,
): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(
    `-# ${formatPageFooter(pageIndex, totalPages, hintOrTotalItems)}`,
  );
}
