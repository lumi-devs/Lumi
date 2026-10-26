import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const BackupsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalHours: z.number().int().min(1).max(168).default(3),
  keepCount: z.number().int().min(1).max(50).default(10),
});

export default defineModule({
  name: "security-backups",
  displayName: "Backups",
  emoji: "💾",
  description: "Periodic server structure snapshots for auto-recovery",
  version: "2.0.0",
  config: BackupsConfigSchema,
  configFields: [],
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security-backups] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security-backups] Module unloaded");
  },
});