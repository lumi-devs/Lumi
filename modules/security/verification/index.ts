import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const VerificationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  verifiedRoleId: z.string().nullable().default(null),
  pendingRoleId: z.string().nullable().default(null),
  timeoutMinutes: z.number().int().min(1).max(1440).default(10),
  kickOnTimeout: z.boolean().default(false),
  mode: z.enum(["emoji", "none", "web"]).default("emoji"),
  target: z.enum(["everyone", "suspicious"]).default("everyone"),
}, {});

export default defineModule({
  name: "security-verification",
  displayName: "Verification",
  emoji: "✅",
  description: "Member verification with emoji captcha, pending/verified roles, and timeout sweep",
  version: "2.0.0",
  config: VerificationConfigSchema,
  configFields: [],
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security-verification] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security-verification] Module unloaded");
  },
});