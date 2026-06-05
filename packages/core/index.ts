// @lumi/core public surface. Apps import the client + setup side-effect from here;
// @lumi/sdk re-exports the addon-facing pieces below. Deep paths stay internal.

export { LumiClient } from "./src/client/LumiClient.js";

// Env helpers
export {
  envParseString,
  envParseInteger,
  envIsDefined,
  type Env,
} from "./src/core/env.js";

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
} from "./src/core/module-system/Module.js";
export { Service } from "./src/core/module-system/Service.js";

// Commands
export {
  BaseCommand,
  BaseSubcommand,
  sendReply,
  replySuccess,
  replyError,
  replyWarning,
  replyInfo,
} from "./src/core/lib/commands.js";

// Permissions
export {
  PermissionLevel,
  PERMISSION_LEVEL_NAMES,
  resolvePermissionLevel,
  type PermissionContext,
  type PermissionModelType,
} from "./src/core/permissions/index.js";

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
} from "./src/utilities/cards.js";

// Assets
export { Emojis, type EmojiKey } from "./src/utilities/assets.js";

// Addon utilities
export { checkModulesEnabled } from "./src/core/lib/module-check.js";
export { relativeTimestamp, shortTimestamp } from "./src/utilities/time.js";
export { swallow, logError, errorFrom } from "./src/utilities/errors.js";
export { RequesterType } from "./src/core/lib/gdpr.js";

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
