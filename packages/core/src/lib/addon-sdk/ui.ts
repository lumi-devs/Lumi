/**
 * `lumi/ui` - reply cards, buttons, pagination, confirmation prompts, emoji.
 *
 * Addon panel contract: build every addon panel as a card (`makeInfoCard`
 * and siblings) whose container follows the core rhythm - title, subtitle,
 * separator, setting rows, footer, then action rows with the hub tab bar
 * last. Keep each section to three text lines and each button label to
 * eighty characters; the helpers below clip silently. Reuse `HubTabs` for
 * the Home/Modules/Permissions/Settings/Addons bar so addon views sit
 * inside the same navigation as core. The `addon*` helpers return fresh
 * builders on every call and render byte-identical output to their core
 * counterparts; prefer them over hand-rolled components.
 */
export {
  makeCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  makeErrorCard,
  makeListCard,
  makeEmptyCard,
  ephemeralCard,
  noPingCard,
  resolveCardColor,
  defaultCardColors,
  type CardReply,
  type CardOptions,
  type CardColorKey,
} from "#utilities/cards.js";
export {
  confirmRow,
  backRow,
  navRow,
  pageFooter,
  tabRow,
  settingRow,
  thumbRow,
  HubTabs,
  SectionLineLimit,
  ButtonLabelLimit,
  type AccessoryButton,
  type Tab,
  type ConfirmRowOptions,
  type NavAction,
  type NavRowOptions,
} from "#utilities/ui/kit.js";
export { confirmPrompt, type ConfirmPromptOptions } from "#utilities/confirm.js";
export { paginateList, paginateContainer } from "#utilities/pagination.js";
export { Emojis } from "#utilities/assets.js";

import {
  settingRow,
  tabRow,
  confirmRow,
  backRow,
  navRow,
  pageFooter,
  type AccessoryButton,
  type Tab,
  type ConfirmRowOptions,
  type NavRowOptions,
} from "#utilities/ui/kit.js";

/** Addon mirror of `settingRow`: label lines plus an inline action button. */
export function addonSettingRow(
  lines: string | string[],
  button: AccessoryButton,
) {
  return settingRow(lines, button);
}

/** Addon mirror of `tabRow`: shared tab bar with one active tab. */
export function addonTabRow(
  prefix: string,
  tabs: readonly Tab[],
  activeId: string,
) {
  return tabRow(prefix, tabs, activeId);
}

/** Addon mirror of `confirmRow`: danger confirm plus secondary cancel. */
export function addonConfirmRow(options: ConfirmRowOptions) {
  return confirmRow(options);
}

/** Addon mirror of `backRow`: lone secondary back button. */
export function addonBackRow(customId: string, label?: string) {
  return backRow(customId, label);
}

/** Addon mirror of `navRow`: back button plus one primary action. */
export function addonNavRow(options: NavRowOptions) {
  return navRow(options);
}

/** Addon mirror of `pageFooter`: muted `Page x of y` footer line. */
export function addonPageFooter(
  pageIndex: number,
  totalPages: number,
  hintOrTotalItems?: string | number,
) {
  return pageFooter(pageIndex, totalPages, hintOrTotalItems);
}
