import type { ConfigField, ModuleConfigSchema } from "#src/lib/module-system/ConfigSchema.js";

export interface ModuleDefinition {
  name?: string | undefined;
  displayName?: string | undefined;
  emoji?: string | undefined;
  description?: string | undefined;
  short?: string | undefined;
  endUserDataStatement?: string | undefined;
  version?: string | undefined;
  conflicts?: string[] | undefined;

  dependencies?: string[] | undefined;
  configFields?: ConfigField[] | undefined;
  configSchema?: ModuleConfigSchema | undefined;
  configOverrides?: boolean | undefined;
  disableable?: boolean | undefined;

  category?: string | undefined;

  dashboardHref?: string | undefined;
  author?: string[] | undefined;
  requirements?: string[] | undefined;
  install_msg?: string | undefined;
  tags?: string[] | undefined;
  hidden?: boolean | undefined;
  disabled?: boolean | undefined;
  min_bot_version?: string | undefined;
  max_bot_version?: string | undefined;
}

export interface ModuleMeta {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  short?: string | undefined;
  endUserDataStatement?: string | undefined;
  version: string;
  disableable?: boolean | undefined;
  conflicts?: string[] | undefined;

  dependencies?: string[] | undefined;
  configFields?: ConfigField[] | undefined;
  configSchema?: ModuleConfigSchema | undefined;
  configOverrides?: boolean | undefined;

  category?: string | undefined;

  dashboardHref?: string | undefined;
  author?: string[] | undefined;
  requirements?: string[] | undefined;
  install_msg?: string | undefined;
  tags?: string[] | undefined;
  hidden?: boolean | undefined;
  disabled?: boolean | undefined;
  min_bot_version?: string | undefined;
  max_bot_version?: string | undefined;
}

export function NoEndUserData(): undefined {
  return undefined;
}
