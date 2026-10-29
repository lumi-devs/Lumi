import {
  ActionRowBuilder,
  ButtonBuilder,
  SectionBuilder,
  type StringSelectMenuBuilder,
  TextDisplayBuilder,
  type AnyComponentBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle, type APIMessageComponentEmoji } from "discord.js";
import { componentEmoji, setEmojiIfPresent } from "./emoji.js";
import { createStringSelectMenu } from "./selects.js";

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

export function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components);
}

export interface CreateActionButtonOptions {
  customId?: string | undefined;
  url?: string | undefined;
  label?: string | undefined;
  style?: ButtonStyle | undefined;
  emoji?: string | APIMessageComponentEmoji | undefined;
  disabled?: boolean | undefined;
}

export interface CreatePaginationRowOptions {
  customIdPrefix: string;
  currentPage: number;
  totalPages: number;
  disabled?: boolean;
}

export const ButtonLabelLimit = 80;
const clipLabel = (label: string): string =>
  label.length > ButtonLabelLimit ? label.slice(0, ButtonLabelLimit) : label;

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
  if (options.customId && options.url) {
    throw new Error("createActionButton: customId and url are mutually exclusive.");
  }
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
    .setEmoji(componentEmoji("⬅️"))
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
    .setEmoji(componentEmoji("➡️"))
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

  if (!Array.isArray(rows)) return [];
  const validRows = rows.filter((r): r is ActionRowBuilder<T> => r instanceof ActionRowBuilder);
  const finalRows = validRows.slice(0, MaxRows);

  return finalRows.map((row) => {
    if (row.components.length > MaxComponents) {
      return new ActionRowBuilder<T>().addComponents(row.components.slice(0, MaxComponents));
    }
    return row;
  });
}

export interface Tab {
  id: string;
  label: string;
  emoji?: string | APIMessageComponentEmoji;
}

export function tabRow(
  prefix: string,
  tabs: readonly Tab[],
  activeId: string,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const tab of tabs.slice(0, 5)) {
    const active = tab.id === activeId;
    row.addComponents(
      createActionButton({
        customId: `${prefix}:${tab.id}`,
        label: tab.label,
        style: active ? ButtonStyle.Primary : ButtonStyle.Secondary,
        emoji: tab.emoji,
        disabled: active,
      }),
    );
  }
  return row;
}

export interface AccessoryButton {
  customId: string;
  label?: string;
  style?: ButtonStyle;
  emoji?: string | APIMessageComponentEmoji;
  disabled?: boolean;
}

export const SectionLineLimit = 3;
const clipLines = (lines: string | string[]): string[] =>
  (Array.isArray(lines) ? lines : [lines]).slice(0, SectionLineLimit);

const toButton = (b: AccessoryButton): ButtonBuilder => {
  const button = new ButtonBuilder()
    .setCustomId(b.customId)
    .setStyle(b.style ?? ButtonStyle.Secondary);
  if (b.label) button.setLabel(clipLabel(b.label));
  setEmojiIfPresent(button, b.emoji);
  if (b.disabled !== undefined) button.setDisabled(b.disabled);
  return button;
};

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

export function confirmRow(
  options: ConfirmRowOptions,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    toButton({
      customId: options.confirmId,
      label: options.confirmLabel ?? "Confirm",
      style: options.confirmStyle ?? ButtonStyle.Danger,
    }),
    toButton({
      customId: options.cancelId,
      label: options.cancelLabel ?? "Cancel",
    }),
  );
}

export interface ConfirmRowOptions {
  confirmId: string;
  cancelId: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: ButtonStyle;
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
  placeholder = "Select Category...",
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    createStringSelectMenu({
      customId,
      placeholder,
      options: categories.map((category) => ({
        label:
          category.count !== undefined
            ? `${category.label} (${category.count})`
            : category.label,
        value: category.id,
        description: category.description,
        emoji: category.emoji,
        default: category.id === activeCategoryId,
      })),
    }),
  );
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

export function backRow(
  customId: string,
  label = "← Back",
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createBackButton(customId, label),
  );
}

export function navRow(
  options: NavRowOptions,
): ActionRowBuilder<ButtonBuilder> {
  const action = createActionButton({
    customId: options.action.customId,
    label: options.action.label,
    style: options.action.style,
    emoji: options.action.emoji,
    disabled: options.action.disabled,
  });
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createBackButton(options.backId, options.backLabel ?? "← Back"),
    action,
  );
}
