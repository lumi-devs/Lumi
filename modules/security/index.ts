import { defineModule } from "@lumi/module-kit";
import { SecurityConfigSchema } from "./config.js";

const SecuritySupermodule = defineModule({
  name: "security",
  displayName: "Security",
  emoji: "🛡️",
  description:
    "Server protection suite: anti-nuke, join gate, verification, panic mode, backups, and automod",
  version: "2.0.0",
  config: SecurityConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad(_services) {
    console.log("[security] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[security] Supermodule unloaded");
  },
});

export default SecuritySupermodule;
