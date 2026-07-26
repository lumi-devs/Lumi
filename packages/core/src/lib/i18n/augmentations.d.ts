import type common from "../../languages/en-US/common.json";
import type commands from "../../languages/en-US/commands.json";
import type preconditions from "../../languages/en-US/preconditions.json";
import type core from "../../languages/en-US/core.json";
import type tempvc from "../../languages/en-US/tempvc.json";
import type afk from "../../languages/en-US/afk.json";
import type logging from "../../languages/en-US/logging.json";
import type filter from "../../languages/en-US/filter.json";

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
    };
  }
}
