import type { ConfigField, ModuleConfigSchema } from "./config-schema.js";

/**
 * Configuration options provided to `defineModule`.
 */
export interface ModuleDefinition {
  name?: string;
  displayName?: string;
  emoji?: string;
  description?: string;
  short?: string;
  endUserDataStatement?: string;
  version?: string;
  conflicts?: string[];
  /**
   * Other modules this one requires, each either a plain name (`"economy"`)
   * or a name with a semver range (`"leveling@^1.2.0"`) that the installed
   * module's `version` must satisfy. See
   * {@link "#lib/module-system/dependencies.js".parseDependencySpec}.
   */
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: ModuleConfigSchema;
  configOverrides?: boolean;
  disableable?: boolean;
  /** Dashboard sidebar/grid grouping (e.g. "Moderation", "Security"). Falls back to "System" when absent. */
  category?: string;
  /** Dashboard route (relative to `/guild/:id/`) for a bespoke settings page, instead of the generic `/modules/[name]` form. */
  dashboardHref?: string;
}

/** Used during module discovery without executing the module's code. */
export interface ModuleMeta {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  short?: string;
  endUserDataStatement?: string;
  version: string;
  disableable?: boolean;
  conflicts?: string[];
  /** See {@link ModuleDefinition.dependencies}: plain `"name"` or ranged `"name@range"`. */
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: ModuleConfigSchema;
  configOverrides?: boolean;
  /** Dashboard sidebar/grid grouping (e.g. "Moderation", "Security"). Falls back to "System" when absent. */
  category?: string;
  /** Dashboard route (relative to `/guild/:id/`) for a bespoke settings page, instead of the generic `/modules/[name]` form. */
  dashboardHref?: string;
}

/**
 * Explicit sentinel function declaring that a module does not persistently store
 * end-user data (GDPR/CCPA compliant declaration).
 */
export function NoEndUserData(): undefined {
  return undefined;
}
