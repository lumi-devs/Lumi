import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  RoleSelectMenuBuilder,
  SectionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  UserSelectMenuBuilder,
  type AnyComponentBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  ChannelType,
  type APIMessageComponentEmoji,
} from "discord.js";
import { container } from "@sapphire/framework";
import { Emojis } from "#lib/utilities/assets.js";
import { formatPageFooter } from "./layout.js";

function setEmojiIfPresent(
  builder: StringSelectMenuOptionBuilder | ButtonBuilder,
  emoji?: string | APIMessageComponentEmoji,
): void {
  if (emoji) {
    if (typeof emoji === "string") {
      builder.setEmoji(Emojis.parse(emoji));
    } else {
      builder.setEmoji(emoji);
    }
  }
}

function applySelectMenuOptions(
  menu:
    | UserSelectMenuBuilder
    | RoleSelectMenuBuilder
    | ChannelSelectMenuBuilder
    | MentionableSelectMenuBuilder,
  opts: CreateUserSelectMenuOptions &
    CreateRoleSelectMenuOptions &
    CreateChannelSelectMenuOptions &
    CreateMentionableSelectMenuOptions,
): void {
  if (opts.placeholder) menu.setPlaceholder(opts.placeholder);
  if (opts.minValues !== undefined) menu.setMinValues(opts.minValues);
  if (opts.maxValues !== undefined) menu.setMaxValues(opts.maxValues);
  if (opts.disabled !== undefined) menu.setDisabled(opts.disabled);
}

export interface CreateUserSelectMenuOptions {
  customId: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}

export interface CreateRoleSelectMenuOptions {
  customId: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}

export interface CreateChannelSelectMenuOptions {
  customId: string;
  placeholder?: string;
  channelTypes?: ChannelType[];
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}

export interface CreateMentionableSelectMenuOptions {
  customId: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}

interface StringSelectOptionInput {
  label: string;
  value: string;
  description?: string;
  emoji?: string | APIMessageComponentEmoji;
  default?: boolean;
}

export interface CreateStringSelectMenuOptions {
  customId: string;
  placeholder?: string;
  options?: (StringSelectOptionInput | StringSelectMenuOptionBuilder)[];
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}

export function createUserSelectMenu(
  options: CreateUserSelectMenuOptions,
): UserSelectMenuBuilder {
  const menu = new UserSelectMenuBuilder().setCustomId(options.customId);
  applySelectMenuOptions(menu, options);
  return menu;
}

export function createRoleSelectMenu(
  options: CreateRoleSelectMenuOptions,
): RoleSelectMenuBuilder {
  const menu = new RoleSelectMenuBuilder().setCustomId(options.customId);
  applySelectMenuOptions(menu, options);
  return menu;
}

export function createChannelSelectMenu(
  options: CreateChannelSelectMenuOptions,
): ChannelSelectMenuBuilder {
  const menu = new ChannelSelectMenuBuilder().setCustomId(options.customId);
  if (options.channelTypes && options.channelTypes.length > 0) {
    menu.setChannelTypes(options.channelTypes);
  }
  applySelectMenuOptions(menu, options);
  return menu;
}

export function createMentionableSelectMenu(
  options: CreateMentionableSelectMenuOptions,
): MentionableSelectMenuBuilder {
  const menu = new MentionableSelectMenuBuilder().setCustomId(options.customId);
  applySelectMenuOptions(menu, options);
  return menu;
}

export function createStringSelectMenu(
  options: CreateStringSelectMenuOptions,
): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder().setCustomId(options.customId);
  if (options.placeholder) menu.setPlaceholder(options.placeholder);
  if (options.minValues !== undefined) menu.setMinValues(options.minValues);
  if (options.maxValues !== undefined) menu.setMaxValues(options.maxValues);
  if (options.disabled !== undefined) menu.setDisabled(options.disabled);

  if (options.options && options.options.length > 0) {
    const formattedOptions = options.options.map((opt) => {
      if (opt instanceof StringSelectMenuOptionBuilder) {
        return opt;
      }
      const optionBuilder = new StringSelectMenuOptionBuilder()
        .setLabel(opt.label)
        .setValue(opt.value);
      if (opt.description) optionBuilder.setDescription(opt.description);
      setEmojiIfPresent(optionBuilder, opt.emoji);
      if (opt.default !== undefined) optionBuilder.setDefault(opt.default);
      return optionBuilder;
    });
    menu.addOptions(formattedOptions);
  }

  return menu;
}

export interface CreateActionButtonOptions {
  customId?: string;
  url?: string;
  label?: string;
  style?: ButtonStyle;
  emoji?: string | APIMessageComponentEmoji;
  disabled?: boolean;
}

export interface CreatePaginationRowOptions {
  customIdPrefix: string;
  currentPage: number;
  totalPages: number;
  disabled?: boolean;
}

export function createBackButton(
  customId: string,
  label = "← Back",
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(clipLabel(label))
    .setStyle(ButtonStyle.Secondary);
}

export function createActionButton(
  options: CreateActionButtonOptions,
): ButtonBuilder {
  const button = new ButtonBuilder();
  if (options.customId) button.setCustomId(options.customId);
  if (options.url) button.setURL(options.url);
  if (options.label) button.setLabel(clipLabel(options.label));
  button.setStyle(options.style ?? (options.url ? ButtonStyle.Link : ButtonStyle.Primary));
  setEmojiIfPresent(button, options.emoji);
  if (options.disabled !== undefined) button.setDisabled(options.disabled);
  return button;
}

export function createPaginationRow(
  options: CreatePaginationRowOptions,
): ActionRowBuilder<ButtonBuilder> {
  const { customIdPrefix, currentPage, totalPages, disabled = false } = options;
  const safeTotalPages = Math.max(1, totalPages);
  const isFirstPage = currentPage <= 0;
  const isLastPage = currentPage >= safeTotalPages - 1;

  const prevBtn = new ButtonBuilder()
    .setCustomId(`${customIdPrefix}:prev:${Math.max(0, currentPage - 1)}`)
    .setLabel("Prev")
    .setEmoji(Emojis.parse(Emojis.ArrowLeft))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || isFirstPage);

  const indicatorBtn = new ButtonBuilder()
    .setCustomId(`${customIdPrefix}:indicator`)
    .setLabel(`${currentPage + 1} / ${safeTotalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`${customIdPrefix}:next:${currentPage + 1}`)
    .setLabel("Next")
    .setEmoji(Emojis.parse(Emojis.ArrowRight))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || isLastPage);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevBtn,
    indicatorBtn,
    nextBtn,
  );
}

export function buildSafeActionRows<
  T extends AnyComponentBuilder = MessageActionRowComponentBuilder,
>(rows: (ActionRowBuilder<T> | unknown)[]): ActionRowBuilder<T>[] {
  const MaxRows = 5;
  const MaxComponents = 5;
  if (!rows || !Array.isArray(rows)) return [];

  const validRows = rows.filter((r): r is ActionRowBuilder<T> => r instanceof ActionRowBuilder);

  if (validRows.length > MaxRows) {
    const warningMsg = `[PanelSafety] ActionRow limit exceeded (${validRows.length} > ${MaxRows}). Truncating to first ${MaxRows} rows.`;
    container.logger?.warn(warningMsg);
  }

  const finalRows = validRows.slice(0, MaxRows);
  for (const row of finalRows) {
    if (row.components.length > MaxComponents) {
      container.logger?.warn(`[PanelSafety] Component limit exceeded in row (${row.components.length} > ${MaxComponents}). Truncating.`);
      row.setComponents(row.components.slice(0, MaxComponents));
    }
  }

  return finalRows;
}
export interface CategoryTab {
  id: string;
  label: string;
  emoji?: string;
  count?: number;
  description?: string;
}

export function createCategorySubmenuRow(
  customId: string,
  categories: CategoryTab[],
  activeCategoryId?: string,
  placeholder = "Select Submenu Category...",
): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = categories.map((cat) => ({
    label: cat.count !== undefined ? `${cat.label} (${cat.count})` : cat.label,
    value: cat.id,
    description: cat.description,
    emoji: cat.emoji,
    default: cat.id === activeCategoryId,
  }));

  const menu = createStringSelectMenu({
    customId,
    placeholder,
    options,
  });

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

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

const clipLabel = (label: string): string =>
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

