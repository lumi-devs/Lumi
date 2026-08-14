import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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
import { Emojis } from "#utilities/assets.js";

export { formatBreadcrumbHeader, formatStatusBadge, formatSubtitle, breadcrumbs } from "./ui/layout.js";
export {
  settingRow,
  thumbRow,
  tabRow,
  confirmRow,
  backRow,
  type AccessoryButton,
  type Tab,
  type ConfirmRowOptions,
} from "./ui/kit.js";

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

export interface StringSelectOptionInput {
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
  customId: string;
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
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
}

export function createActionButton(
  options: CreateActionButtonOptions,
): ButtonBuilder {
  const button = new ButtonBuilder().setCustomId(options.customId);
  if (options.label) button.setLabel(options.label);
  button.setStyle(options.style ?? ButtonStyle.Primary);
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
    .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
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
    .setEmoji(Emojis.parse(Emojis.ARROW_RIGHT))
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
  const MAX_ROWS = 5;
  if (!rows || !Array.isArray(rows)) return [];

  const validRows = rows.filter((r): r is ActionRowBuilder<T> => r instanceof ActionRowBuilder);

  if (validRows.length > MAX_ROWS) {
    const warningMsg = `[PanelSafety] ActionRow limit exceeded (${validRows.length} > ${MAX_ROWS}). Truncating to first ${MAX_ROWS} rows.`;
    container.logger?.warn(warningMsg);
  }

  return validRows.slice(0, MAX_ROWS);
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

