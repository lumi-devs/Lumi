import { defineModule } from "@lumi/module-kit";
import { SecurityConfigSchema } from "./config.js";

const SecurityCoreModule = defineModule({
  name: "security",
  displayName: "Security Core",
  emoji: "🛡️",
  description: "Shared security settings used by all security modules",
  version: "2.0.0",
  config: SecurityConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad(_services) {
    console.log("[security] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security] Module unloaded");
  },
});

export default SecurityCoreModule;
