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
  configFields: [
    { key: "logChannelId", label: "Security Log Channel", type: "channel", description: "Channel for security logs (anti-nuke, join gate, verification, panic, betrayal)", channelTypes: [0] },
    { key: "quarantineRoleId", label: "Quarantine Role", type: "role", description: "Role assigned to quarantined members (required for anti-nuke, join gate, verification)" },
    { key: "trustedRoleIds", label: "Trusted Roles", type: "multi-role", description: "Role IDs exempt from anti-nuke and join gate filters" },
    { key: "minAccountAgeHours", label: "Min Account Age (hours)", type: "number", description: "Accounts younger than this are flagged by join gate (0 disables)", default: 0, min: 0, max: 8760 },
  ],
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