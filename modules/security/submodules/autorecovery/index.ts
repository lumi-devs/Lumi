import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const AutoRecoveryConfigSchema = z.object({
  enabled: z.boolean().default(false),
  triggerOnPanic: z.boolean().default(true),
  triggerOnNuke: z.boolean().default(false),
});

export default defineModule({
  name: "security-autorecovery",
  displayName: "Auto Recovery",
  emoji: "♻️",
  description: "Automatic server restore from latest backup on panic/nuke",
  version: "2.0.0",
  config: AutoRecoveryConfigSchema,
  configFields: [],
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security-autorecovery] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security-autorecovery] Module unloaded");
  },
});