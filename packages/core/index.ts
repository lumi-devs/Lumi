// @lumi/core public surface. Apps import the client + setup side-effect from here;
// @lumi/sdk re-exports the addon-facing pieces below. Deep paths stay internal.

export { LumiClient } from "./src/lib/client/LumiClient.js";

// Env helpers
export {
  envParseString,
  envParseInteger,
  envIsDefined,
  type Env,
} from "./src/lib/env.js";

// Module system
export {
  Module,
  DefineModule,
  cfg,
  parseConfigList,
  FieldType,
  type ConfigField,
  type ModuleMeta,
  type ModuleOptions,
} from "./src/lib/module-system/Module.js";
export { Service } from "./src/lib/module-system/Service.js";

// Commands
export {
  BaseCommand,
  BaseSubcommand,
  sendReply,
  replySuccess,
  replyError,
  replyWarning,
  replyInfo,
} from "./src/lib/commands.js";

// Permissions
export {
  PermissionLevel,
  PERMISSION_LEVEL_NAMES,
  resolvePermissionLevel,
  type PermissionContext,
  type PermissionModelType,
} from "./src/lib/permissions/index.js";

// Cards
export {
  makeCard,
  makeSuccessCard,
  makeErrorCard,
  makeWarningCard,
  makeInfoCard,
  makeListCard,
  ephemeralCard,
  noPingCard,
  type CardOptions,
  type CardReply,
} from "./src/lib/utilities/cards.js";

// Assets
export { Emojis, type EmojiKey } from "./src/lib/utilities/assets.js";

// Addon utilities
export { checkModulesEnabled } from "./src/lib/module-check.js";
export { relativeTimestamp, shortTimestamp } from "./src/lib/utilities/time.js";
export { swallow, logError, errorFrom } from "./src/lib/utilities/errors.js";
export { RequesterType } from "./src/lib/gdpr.js";

// Discord formatters — re-exported so addons import from @lumi/sdk only
export {
  userMention,
  channelMention,
  roleMention,
  time,
  TimestampStyles,
  escapeMarkdown,
  bold,
  italic,
  strikethrough,
  underscore,
  inlineCode,
  codeBlock,
  blockQuote,
  spoiler,
  hyperlink,
} from "@discordjs/formatters";

// Shared wire contracts
export * from "@lumi/contracts";

// Pagination and i18n
export {
  paginateContainer,
  paginateList,
  type PaginationOptions,
  type PaginateListOptions,
} from "./src/lib/utilities/pagination.js";
export { LanguageKeys, CommonKeys, PreconditionsKeys, CommandsKeys } from "./src/lib/i18n/keys.js";
