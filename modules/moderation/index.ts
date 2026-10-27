import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const ModerationConfigSchema = z.object({
  quarantineRoleId: z.string().nullable().default(null),
  maxTargets: z.number().int().min(1).max(100).default(10),
  immuneRoleIds: z.array(z.string(), {}).default([]),
  warnThresholds: z.record(z.string(), z.object({
    action: z.enum(["timeout", "kick", "ban"]),
    duration: z.number().int().optional(),
  })).default({}),
}, {});

const ModerationSupermodule = defineModule({
  name: "moderation",
  displayName: "Moderation",
  emoji: "🛡️",
  description: "Moderation tools: cases, bans, kicks, timeouts, warns, quarantine, lockdown",
  version: "2.0.0",
  config: ModerationConfigSchema,
  configFields: [
    { key: "quarantineRoleId", label: "Quarantine Role", type: "role", description: "Role assigned when quarantined" },
    { key: "maxTargets", label: "Max Targets", type: "number", description: "Max members per command", default: 10 },
    { key: "immuneRoleIds", label: "Immune Roles", type: "multi-role", description: "Roles exempt from auto-actions" },
    { key: "warnThresholds", label: "Warn Thresholds", type: "json", description: "JSON object: warn count -> {action, duration}" },
  ],
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
