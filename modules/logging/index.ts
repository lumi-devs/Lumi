import { defineModule } from "@lumi/module-kit";
import { LoggingConfigSchema } from "./logs/config.js";

const LoggingSupermodule = defineModule({
  name: "logging",
  displayName: "Logging",
  emoji: "📝",
  description: "Message, edit, delete, and voice logging",
  version: "2.0.0",
  config: LoggingConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[logging] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[logging] Supermodule unloaded");
  },
});

export default LoggingSupermodule;
