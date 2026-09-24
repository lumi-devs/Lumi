import type { ConfigField, ModuleConfigSchema } from "./config-schema.js";

/**
 * Configuration options provided to the `@DefineModule` decorator or the `Module` constructor.
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
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: ModuleConfigSchema;
  configOverrides?: boolean;
  /** Dashboard sidebar/grid grouping (e.g. "Moderation", "Security"). Falls back to "System" when absent. */
  category?: string;
  /** Dashboard route (relative to `/guild/:id/`) for a bespoke settings page, instead of the generic `/modules/[name]` form. */
  dashboardHref?: string;
  onLoad?: () => void;
  onUnload?: () => void;
}

/**
 * Explicit sentinel function declaring that a module does not persistently store
 * end-user data (GDPR/CCPA compliant declaration).
 */
export function NoEndUserData(): undefined {
  return undefined;
}
