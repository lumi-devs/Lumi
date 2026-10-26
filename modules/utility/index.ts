import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const UtilitySupermodule = defineModule({
  name: "utility",
  displayName: "Utility",
  emoji: "🔧",
  description: "Utility tools: AFK, temporary voice, and info commands",
  version: "2.0.0",
  config: z.object({}),
  configFields: [],
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[utility] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[utility] Supermodule unloaded");
  },
});

export default UtilitySupermodule;
