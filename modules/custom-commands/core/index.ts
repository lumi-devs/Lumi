import {
  defineModule,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import { customCommandCommand } from "./command.js";
import { CustomCommandsConfigSchema } from "./config.js";
import {
  interactionListener,
  messageListener,
  reactionAddListener,
  reactionRemoveListener,
} from "./listeners.js";
import { scheduleTask } from "./schedules.js";
import { invalidateAll } from "./store.js";
import { ModuleName } from "./types.js";

const customCommandsModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Custom Commands",
  emoji: "🧩",
  description:
    "Guild-authored commands with safe templates, triggers, schedules, and per-user KV storage",
  version: "2.0.0",
  config: CustomCommandsConfigSchema,
  commands: [customCommandCommand],
  listeners: [
    messageListener,
    reactionAddListener,
    reactionRemoveListener,
    interactionListener,
  ],
  tasks: [scheduleTask],
  async onLoad(_services: ModuleServices) {
    console.log(`[${ModuleName}] Module loaded`);
    return [() => invalidateAll()];
  },
  async onUnload(_services: ModuleServices) {
    invalidateAll();
    console.log(`[${ModuleName}] Module unloaded`);
  },
});

export default customCommandsModule;
