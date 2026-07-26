import type { ConfigField } from "./config.js";

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

export interface ModuleManifest {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  isCore?: boolean;
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
}
