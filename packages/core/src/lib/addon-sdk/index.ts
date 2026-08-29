/**
 * `lumi` - the addon entry point.
 *
 * Every addon needs a module class and a way to reach a service; that's what
 * lives here. Everything else is a dedicated subpath, same shape as Red's
 * `redbot.core.commands` / `redbot.core.utils.chat_formatting`:
 *
 *   import { Module, DefineModule, cfg } from "lumi";
 *   import { BaseCommand, CommandContext } from "lumi/commands";
 *   import { hasRequiredPermit } from "lumi/permissions";
 *   import { scheduleTask, RelayTask } from "lumi/scheduling";
 *   import { makeSuccessCard, Emojis } from "lumi/ui";
 *   import { BotConfig, relativeTimestamp } from "lumi/utils";
 *
 * Never import Lumi's internal `#core/*`, `#lib/*`, `#utilities/*` or
 * `#database/*` paths from addon code - those are implementation details
 * that move on any core refactor. `lumi` and its subpaths are the contract.
 */
export {
  Module,
  DefineModule,
  cfg,
  FieldType,
  parseConfigList,
  type ModuleMeta,
  type ModuleOptions,
  type ConfigField,
  type ModuleConfigSchema,
} from "#core/module-system/Module.js";
export { ModuleListener, type ModuleListenerOptions } from "#core/module-system/ModuleListener.js";
export { GuildMessageListener } from "#core/module-system/GuildMessageListener.js";
export {
  Service,
  getService,
  tryGetService,
  type Services,
} from "#core/module-system/Service.js";
