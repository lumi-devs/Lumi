import {
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from "@discordjs/builders";
import type { APIMessageComponentEmoji, ChannelType } from "discord.js";
import { setEmojiIfPresent } from "./emoji.js";

function applySelectMenuOptions(
  menu:
    | UserSelectMenuBuilder
    | RoleSelectMenuBuilder
    | ChannelSelectMenuBuilder
    | MentionableSelectMenuBuilder
    | StringSelectMenuBuilder,
  opts: SelectMenuOptions,
): void {
  if (opts.placeholder) menu.setPlaceholder(opts.placeholder);
  if (opts.minValues !== undefined) menu.setMinValues(opts.minValues);
  if (opts.maxValues !== undefined) menu.setMaxValues(opts.maxValues);
  if (opts.disabled !== undefined) menu.setDisabled(opts.disabled);
}

export interface SelectMenuOptions {
  customId: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}

export type CreateUserSelectMenuOptions = SelectMenuOptions;
export type CreateRoleSelectMenuOptions = SelectMenuOptions;
export type CreateMentionableSelectMenuOptions = SelectMenuOptions;

export interface CreateChannelSelectMenuOptions extends SelectMenuOptions {
  channelTypes?: ChannelType[];
}

export interface StringSelectOptionInput {
  label: string;
  value: string;
  description?: string | undefined;
  emoji?: string | APIMessageComponentEmoji | undefined;
  default?: boolean;
}

export interface CreateStringSelectMenuOptions extends SelectMenuOptions {
  options?: (StringSelectOptionInput | StringSelectMenuOptionBuilder)[];
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
  applySelectMenuOptions(menu, options);
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
