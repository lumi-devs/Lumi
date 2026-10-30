import { defineModule } from "@lumi/module-kit";

const ModerationSupermodule = defineModule({
  name: "moderation",
  displayName: "Moderation",
  emoji: "🛡️",
  description:
    "Moderation tools: cases, bans, kicks, timeouts, warns, quarantine, lockdown",
  version: "2.0.0",
  config: {},
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[moderation] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[moderation] Supermodule unloaded");
  },
});

export default ModerationSupermodule;
