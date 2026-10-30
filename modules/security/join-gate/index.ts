import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const JoinGateConfigSchema = z.object({
  enabled: z.boolean().default(false),
  minAccountAgeHours: z.number().int().min(0).max(8760).default(0),
  raidJoinCount: z.number().int().min(3).max(100).default(10),
  raidWindowSeconds: z.number().int().min(5).max(300).default(30),
  raidAction: z.enum(["kick", "timeout", "quarantine"]).default("kick"),
  raidAccountType: z.enum(["all", "suspicious"]).default("all"),
  raidWarnRoleIds: z.array(z.string()).default([]),
  filterNoAvatarEnabled: z.boolean().default(false),
  filterNoAvatarAction: z.enum(["log", "kick", "timeout", "quarantine"]).default("log"),
  filterMinAgeEnabled: z.boolean().default(false),
  filterMinAgeHours: z.number().int().min(0).max(8760).default(0),
  filterMinAgeAction: z.enum(["log", "kick", "timeout", "quarantine"]).default("kick"),
  filterUnverifiedBotEnabled: z.boolean().default(false),
  filterUnverifiedBotAction: z.enum(["log", "kick", "timeout", "quarantine"]).default("kick"),
  filterUsernamePatternEnabled: z.boolean().default(false),
  filterUsernamePatterns: z.array(z.string()).default([]),
  filterUsernamePatternAction: z.enum(["log", "kick", "timeout", "quarantine"]).default("log"),
  filterAdvertisingEnabled: z.boolean().default(false),
  filterAdvertisingAction: z.enum(["log", "kick", "timeout", "quarantine"]).default("kick"),
});

export default defineModule({
  name: "security-join-gate",
  displayName: "Join Gate",
  emoji: "🚪",
  description: "On-join security filters and raid detection",
  version: "2.0.0",
  config: JoinGateConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security-join-gate] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security-join-gate] Module unloaded");
  },
});