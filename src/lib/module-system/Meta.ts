import type { ConfigField, ModuleConfigSchema } from "#src/lib/module-system/ConfigSchema.js";

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

  category?: string;

  dashboardHref?: string;
  author?: string[];
  requirements?: string[];
  install_msg?: string;
  tags?: string[];
  hidden?: boolean;
  disabled?: boolean;
  min_bot_version?: string;
  max_bot_version?: string;
}

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

  category?: string;

  dashboardHref?: string;
  author?: string[];
  requirements?: string[];
  install_msg?: string;
  tags?: string[];
  hidden?: boolean;
  disabled?: boolean;
  min_bot_version?: string;
  max_bot_version?: string;
}

export function NoEndUserData(): undefined {
  return undefined;
}
