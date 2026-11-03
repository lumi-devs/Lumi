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
import { invalidateAll, invalidateGuild } from "./store.js";
import { ModuleName } from "./types.js";

const customCommandsModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Custom Commands",
  emoji: "🧩",
  description:
    "Guild-authored commands with safe templates, triggers, schedules, and per-user KV storage",
  version: "2.0.0",
  config: CustomCommandsConfigSchema,
  dataLifecycle: {
    async exportUserData(services, guildId, userId) {
      const [commands, kv] = await Promise.all([
        services.helpers.customCommands.listCommandsCreatedBy(guildId, userId),
        services.helpers.customCommands.listKvForUser(guildId, userId),
      ]);
      return { commands, kv };
    },
    async deleteUserData(services, guildId, userId) {
      const result = await services.helpers.customCommands.deleteUserData(
        guildId,
        userId,
      );
      invalidateGuild(guildId);
      return { deleted: result.commands + result.kv };
    },
  },
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
