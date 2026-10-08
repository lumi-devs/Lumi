import {
  fieldsFromSchema,
  type ConfigField,
} from "#lib/module-system/config-schema.js";
import type { ModuleDefinition } from "#lib/module-system/meta.js";
import { call } from "./rpc.js";

export {
  cfg,
  FieldType,
  toStringArray,
  type ConfigField,
  type ModuleConfigSchema,
} from "#lib/module-system/config-schema.js";

export { NoEndUserData } from "#lib/module-system/meta.js";

export type ModuleOptions = Omit<ModuleDefinition, "configOverrides" | "dashboardHref"> & { name: string };
export type ModuleMeta = ModuleOptions & { displayName: string; configFields: ConfigField[] };

export function defineModule(options: ModuleOptions): ModuleMeta {
  return {
    ...options,
    displayName: options.displayName ?? options.name,
    configFields:
      options.configFields ??
      (options.configSchema ? fieldsFromSchema(options.configSchema) : []),
  };
}

export const logger = {
  info: (message: string) => call("log", { level: "info", message }),
  warn: (message: string) => call("log", { level: "warn", message }),
  error: (message: string) => call("log", { level: "error", message }),
};
