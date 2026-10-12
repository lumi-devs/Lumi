import type common from "#src/languages/en-US/common.json";
import type commands from "#src/languages/en-US/commands.json";
import type preconditions from "#src/languages/en-US/preconditions.json";
import type core from "#src/languages/en-US/core.json";
import type tempvc from "#src/languages/en-US/tempvc.json";
import type afk from "#src/languages/en-US/afk.json";
import type logging from "#src/languages/en-US/logging.json";
import type filter from "#src/languages/en-US/filter.json";
import type panels from "#src/languages/en-US/panels.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      commands: typeof commands;
      preconditions: typeof preconditions;
      core: typeof core;
      tempvc: typeof tempvc;
      afk: typeof afk;
      logging: typeof logging;
      filter: typeof filter;
      panels: typeof panels;
    };
  }
}
