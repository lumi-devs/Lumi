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
} from "#utilities/ui/kit.js";

/**
 * Stable `addon*` aliases over the kit primitives. Same builders, same bytes —
 * the names exist so third-party code doesn't import `#utilities` internals.
 */
export const addonSettingRow = settingRow;
export const addonTabRow = tabRow;
export const addonConfirmRow = confirmRow;
export const addonBackRow = backRow;
export const addonNavRow = navRow;
export const addonPageFooter = pageFooter;
