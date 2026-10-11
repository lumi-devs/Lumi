import type { ConfigField } from "#src/contracts/Config.js";

export type ModuleCategory = string;

export interface ModuleManifest {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  disableable?: boolean | undefined;

  dependencies?: string[] | undefined;
  conflicts?: string[] | undefined;
  configOverrides?: boolean | undefined;
  configFields: ConfigField[];

  category?: ModuleCategory | undefined;

  short?: string | undefined;

  endUserDataStatement?: string | undefined;

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
