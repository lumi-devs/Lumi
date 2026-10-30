import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const AntiNukeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  windowSeconds: z.number().int().min(10).max(600).default(60),
  maxBans: z.number().int().min(1).max(50).default(5),
  responseBans: z.enum(["log", "quarantine", "ban"]).default("quarantine"),
  maxKicks: z.number().int().min(1).max(50).default(5),
  responseKicks: z.enum(["log", "quarantine", "ban"]).default("quarantine"),
  maxChannelDeletes: z.number().int().min(1).max(50).default(3),
  responseChannelDeletes: z.enum(["log", "quarantine", "ban"]).default("quarantine"),
  maxRoleDeletes: z.number().int().min(1).max(50).default(3),
  responseRoleDeletes: z.enum(["log", "quarantine", "ban"]).default("quarantine"),
  maxWebhookCreates: z.number().int().min(1).max(50).default(3),
  responseWebhookCreates: z.enum(["log", "quarantine", "ban"]).default("quarantine"),
  maxVanityChanges: z.number().int().min(1).max(10).default(1),
  maxPermissionGrants: z.number().int().min(1).max(10).default(1),
  maxQuarantineBypass: z.number().int().min(1).max(10).default(1),
});

export default defineModule({
  name: "security-antinuke",
  displayName: "Anti-Nuke",
  emoji: "☢️",
  description: "Anti-nuke detection with sliding windows, quarantine/ban responses, and trusted role exemptions",
  version: "2.0.0",
  config: AntiNukeConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security-antinuke] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security-antinuke] Module unloaded");
  },
});