import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const SecurityConfigSchema = z.object({
  logChannelId: z.string().nullable().default(null),
  quarantineRoleId: z.string().nullable().default(null),
  trustedRoleIds: z.array(z.string(), {}).default([]),
  minAccountAgeHours: z.number().int().min(0).max(8760).default(0),
}, {});

const SecuritySupermodule = defineModule({
  name: "security",
  displayName: "Security",
  emoji: "🛡️",
  description: "Server protection suite: anti-nuke, join gate, verification, panic mode, backups, and automod",
  version: "2.0.0",
  config: SecurityConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[security] Supermodule unloaded");
  },
});

export default SecuritySupermodule;