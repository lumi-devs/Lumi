// @ember/core public surface. Apps import the client + setup side-effect from here;
// @ember/sdk re-exports the addon-facing pieces below. Deep paths stay internal.

export { EmberClient } from "./src/client/EmberClient.js";

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
  EmberModule,
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
  EmberCommand,
  EmberSubcommand,
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
export { EmberEmojis, type EmberEmojiKey } from "./src/utilities/assets.js";

// Shared wire contracts
export * from "@ember/contracts";
