/**
 * `lumi/ui` - reply cards, buttons, pagination, confirmation prompts, emoji.
 *
 * Addon panel contract: build every addon panel as a card (`makeInfoCard`
 * and siblings) whose container follows the core rhythm - title, subtitle,
 * separator, setting rows, footer, then action rows with the hub tab bar
 * last. Keep each section to three text lines and each button label to
 * eighty characters; the helpers below clip silently. Reuse `HubTabs` for
 * the Home/Modules/Permissions/Settings/Addons bar so addon views sit
 * inside the same navigation as core.
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
  type CardReply,
  type CardOptions,
} from "#lib/utilities/cards.js";
export { resolveCardColor, type CardColorKey } from "#lib/utilities/config.js";
export { BrandColors } from "#lib/branding/colors.js";
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
} from "#lib/utilities/ui/kit.js";
export { confirmPrompt, type ConfirmPromptOptions } from "#lib/utilities/confirm.js";
export { paginateList, paginateContainer } from "#lib/utilities/pagination.js";
export { Emojis } from "#lib/utilities/assets.js";
