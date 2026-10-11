import type { ConfigField } from "#src/contracts/Config.js";

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
  configFields: ConfigField[];

  category?: ModuleCategory;

  short?: string;

  endUserDataStatement?: string;

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
