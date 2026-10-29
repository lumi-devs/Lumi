import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const PanicConfigSchema = z.object({
  enabled: z.boolean().default(false),
  burstLimit: z.number().int().min(1).max(20).default(3),
  burstWindowSeconds: z.number().int().min(1).max(10).default(2),
  durationMinutes: z.number().int().min(1).max(1440).default(30),
  notifyOwners: z.boolean().default(true),
  lockModCommands: z.boolean().default(false),
}, {});

export default defineModule({
  name: "security-panic",
  displayName: "Panic Mode",
  emoji: "🚨",
  description: "Automated server lockdown on threat velocity spikes",
  version: "2.0.0",
  config: PanicConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security-panic] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security-panic] Module unloaded");
  },
});