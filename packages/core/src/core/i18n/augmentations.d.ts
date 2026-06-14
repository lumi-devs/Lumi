// Typed i18next keys. Importing the en-US JSON as the resource shape makes
// `t("commands:languageCurrent")` and `resolveKey(...)` autocomplete and
// type-check against the actual keys that ship in the default language.
import type common from "../../languages/en-US/common.json";
import type commands from "../../languages/en-US/commands.json";
import type preconditions from "../../languages/en-US/preconditions.json";

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
