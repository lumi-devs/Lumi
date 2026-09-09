import {
  fieldsFromSchema,
  type ConfigField,
  type ModuleConfigSchema,
} from "#lib/module-system/config-schema.js";
import { call } from "./rpc.js";

export {
  cfg,
  FieldType,
  toStringArray,
  type ConfigField,
  type ModuleConfigSchema,
} from "#lib/module-system/config-schema.js";

export interface ModuleOptions {
  name: string;
  displayName?: string;
  emoji?: string;
  description?: string;
  short?: string;
  endUserDataStatement?: string;
  version?: string;
  disableable?: boolean;
  conflicts?: string[];
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: ModuleConfigSchema;
  category?: string;
}

export interface ModuleMeta extends ModuleOptions {
  displayName: string;
  configFields: ConfigField[];
}

interface WithModuleMeta {
  meta?: ModuleMeta;
}

export function DefineModule(options: ModuleOptions) {
  return function <T extends abstract new (...args: any[]) => Module>(target: T) {
    (target as WithModuleMeta).meta = {
      ...options,
      displayName: options.displayName ?? options.name,
      configFields:
        options.configFields ??
        (options.configSchema ? fieldsFromSchema(options.configSchema) : []),
    };
    return target;
  };
}

// No deleteUserData/exportUserData hooks: an addon persists only through lumi/kv
// and lumi/redis, which the host owns and sweeps itself. Key per-user records by
// the user id and erasure finds them.
export abstract class Module {
  get meta(): ModuleMeta | undefined {
    return (this.constructor as WithModuleMeta).meta;
  }
}

export function NoEndUserData(): undefined {
  return undefined;
}

export const noEndUserData = NoEndUserData;

export const logger = {
  info: (message: string) => call("log", { level: "info", message }),
  warn: (message: string) => call("log", { level: "warn", message }),
  error: (message: string) => call("log", { level: "error", message }),
};
