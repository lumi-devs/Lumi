import type { ConfigField } from "./config";

// Serializable module manifest contract for discovery and lifecycle metadata.


/** Which deployable service runs a module. Workers run feature modules. */
export type TargetService = "worker" | "gateway" | "scheduler" | "api";

/** Sub-store directory names a module may declare (each = a Sapphire store name). */
export const KNOWN_SUBSTORES = [
  "commands",
  "listeners",
  "interaction-handlers",
  "preconditions",
  "services",
  "scheduled-tasks",
  "routes",
] as const;

export type KnownSubStore = (typeof KNOWN_SUBSTORES)[number];

/**
 * Dashboard sidebar/grid grouping. Not a closed enum on purpose — an addon
 * or a future module can declare any label here and the sidebar/Modules grid
 * will group and count it correctly without a central map to edit.
 */
export type ModuleCategory = string;

export interface ModuleManifest {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  disableable?: boolean;
  dependencies?: string[];
  conflicts?: string[];
  configOverrides?: boolean;
  /** Which service loads this module (workers run feature modules). */
  targetService: TargetService;
  /** Sub-store dirs present in the module, mounted by convention on load. */
  subStores: string[];
  /** Flat config fields derived from the Zod `configSchema` (panel + dashboard). */
  configFields: ConfigField[];
  /** Dashboard sidebar/grid grouping (e.g. "Moderation", "Security"). Falls back to "System" when absent. */
  category?: ModuleCategory;
  /**
   * Dashboard route path (relative to `/guild/:id/`) for this module's
   * settings, when it has a bespoke page instead of the generic
   * `/modules/[name]` config-field form. E.g. `"security"`.
   */
  dashboardHref?: string;
}
