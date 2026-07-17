import "i18next";
import type common from "../languages/en-US/common.json";
import type commands from "../languages/en-US/commands.json";
import type preconditions from "../languages/en-US/preconditions.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      commands: typeof commands;
      preconditions: typeof preconditions;
    };
  }
}
