import {
  type APIMessageComponentEmoji,
  ChannelSelectMenuBuilder,
  type ChannelType,
  MentionableSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from "discord.js";
import { setEmojiIfPresent } from "./emoji.js";

export const SelectOptionLimit = 25;
export const SelectTextLimit = 100;

const clipText = (text: string, limit: number): string =>
  text.length > limit ? text.slice(0, limit) : text;

function applySelectMenuOptions(
  menu:
    | UserSelectMenuBuilder
    | RoleSelectMenuBuilder
    | ChannelSelectMenuBuilder
    | MentionableSelectMenuBuilder
    | StringSelectMenuBuilder,
  opts: SelectMenuOptions,
  optionCount?: number,
): void {
  if (opts.placeholder) {
    menu.setPlaceholder(clipText(opts.placeholder, SelectTextLimit));
  }
  if (opts.disabled !== undefined) menu.setDisabled(opts.disabled);

  const limit = optionCount ?? SelectOptionLimit;
  const min =
    opts.minValues === undefined
      ? undefined
      : Math.max(0, Math.min(limit, Math.trunc(opts.minValues)));
  const max =
    opts.maxValues === undefined
      ? undefined
      : Math.max(0, Math.min(limit, Math.trunc(opts.maxValues)));
  if (min !== undefined) menu.setMinValues(min);
  if (max !== undefined) menu.setMaxValues(max);
  if (min !== undefined && max !== undefined && min > max) {
    menu.setMinValues(max);
  }
}

export interface SelectMenuOptions {
  readonly customId: string;
  readonly placeholder?: string;
  readonly minValues?: number;
  readonly maxValues?: number;
  readonly disabled?: boolean;
}

export type CreateUserSelectMenuOptions = SelectMenuOptions;
export type CreateRoleSelectMenuOptions = SelectMenuOptions;
export type CreateMentionableSelectMenuOptions = SelectMenuOptions;

export interface CreateChannelSelectMenuOptions extends SelectMenuOptions {
  readonly channelTypes?: readonly ChannelType[];
}

export interface StringSelectOptionInput {
  readonly label: string;
  readonly value: string;
  readonly description?: string | undefined;
  readonly emoji?: string | APIMessageComponentEmoji | undefined;
  readonly default?: boolean;
}

export interface CreateStringSelectMenuOptions extends SelectMenuOptions {
  readonly options?: readonly (
    StringSelectOptionInput | StringSelectMenuOptionBuilder
  )[];
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
    menu.setChannelTypes([...options.channelTypes]);
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

function normalizeStringOption(
  input: StringSelectOptionInput | StringSelectMenuOptionBuilder,
): StringSelectMenuOptionBuilder | null {
  const data =
    input instanceof StringSelectMenuOptionBuilder
      ? input.data
      : {
          label: input.label,
          value: input.value,
          description: input.description,
          emoji: input.emoji,
          default: input.default,
        };
  const label =
    data.label === undefined ? "" : clipText(data.label, SelectTextLimit);
  const value =
    data.value === undefined ? "" : clipText(data.value, SelectTextLimit);
  if (label.length === 0 || value.length === 0) return null;

  const option = new StringSelectMenuOptionBuilder()
    .setLabel(label)
    .setValue(value);
  if (data.description) {
    option.setDescription(clipText(data.description, SelectTextLimit));
  }
  if (data.emoji) {
    setEmojiIfPresent(option, data.emoji as string | APIMessageComponentEmoji);
  }
  if (data.default !== undefined) option.setDefault(data.default);
  return option;
}

export function createStringSelectMenu(
  options: CreateStringSelectMenuOptions,
): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder().setCustomId(options.customId);
  const formattedOptions: StringSelectMenuOptionBuilder[] = [];
  const seenValues = new Set<string>();

  for (const input of options.options ?? []) {
    const option = normalizeStringOption(input);
    const value = option?.data.value;
    if (!option || !value || seenValues.has(value)) continue;
    seenValues.add(value);
    formattedOptions.push(option);
    if (formattedOptions.length === SelectOptionLimit) break;
  }

  if (formattedOptions.length > 0) {
    menu.addOptions(formattedOptions);
    applySelectMenuOptions(menu, options, formattedOptions.length);
  } else {
    applySelectMenuOptions(menu, options);
  }

  return menu;
}
