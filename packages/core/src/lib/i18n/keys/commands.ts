import { AfkCommandsKeys } from "#lib/i18n/keys/commands/afk.js";
import { CoreCommandsKeys } from "#lib/i18n/keys/commands/core.js";
import { ModerationCommandsKeys } from "#lib/i18n/keys/commands/mod.js";
import { UtilityCommandsKeys } from "#lib/i18n/keys/commands/utility.js";

/** Every `commands:` key, flattened per module. */
export const CommandsKeys = {
  ...CoreCommandsKeys,
  ...ModerationCommandsKeys,
  ...AfkCommandsKeys,
  ...UtilityCommandsKeys,
} as const;
