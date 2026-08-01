/**
 * Barrel over `keys/`, where the typed key tables live one file per domain.
 * Import keys from here, never from the per-domain files.
 */
import { CommandsKeys } from "#lib/i18n/keys/commands.js";
import { CommonKeys } from "#lib/i18n/keys/common.js";
import { PanelsKeys } from "#lib/i18n/keys/panels.js";
import { PreconditionsKeys } from "#lib/i18n/keys/preconditions.js";

export * from "#lib/i18n/keys/types.js";
export { CommandsKeys, CommonKeys, PanelsKeys, PreconditionsKeys };

export const LanguageKeys = {
  Common: CommonKeys,
  Preconditions: PreconditionsKeys,
  Commands: CommandsKeys,
  Panels: PanelsKeys,
} as const;
