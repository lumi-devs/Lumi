import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const BetrayalConfigSchema = z.object({
  enabled: z.boolean().default(false),
  defaultMinuteLimit: z.number().int().min(1).max(100).default(8),
  defaultHourLimit: z.number().int().min(1).max(1000).default(40),
  actions: z.record(z.string(), z.object({
    minuteLimit: z.number().int().min(1).max(100).optional(),
    hourLimit: z.number().int().min(1).max(1000).optional(),
  })).default({}),
});

export default defineModule({
  name: "security-betrayal",
  displayName: "Betrayal Guard",
  emoji: "🔍",
  description: "Velocity monitoring of whitelisted users with automatic immunity revocation",
  version: "2.0.0",
  config: BetrayalConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security-betrayal] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security-betrayal] Module unloaded");
  },
});