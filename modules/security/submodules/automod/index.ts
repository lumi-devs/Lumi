import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const AutomodConfigSchema = z.object({
  enabled: z.boolean().default(false),
  perMessage: z.number().int().min(0).max(100).default(0),
  perMention: z.number().int().min(0).max(100).default(3),
  perDuplicate: z.number().int().min(0).max(100).default(5),
  perSimilar: z.number().int().min(0).max(100).default(0),
  similarityThreshold: z.number().min(0).max(1).default(0.85),
  perZalgo: z.number().int().min(0).max(100).default(0),
  perFilterHit: z.number().int().min(0).max(100).default(10),
  perAttachment: z.number().int().min(0).max(100).default(0),
  perEmoji: z.number().int().min(0).max(100).default(0),
  perLink: z.number().int().min(0).max(100).default(0),
  webhookMultiplier: z.number().int().min(1).max(20).default(1),
  decayPerMinute: z.number().int().min(1).max(100).default(10),
  warnThreshold: z.number().int().min(0).max(1000).default(15),
  timeoutThreshold: z.number().int().min(0).max(1000).default(30),
  quarantineThreshold: z.number().int().min(0).max(1000).default(0),
  timeoutMinutes: z.number().int().min(1).max(40320).default(10),
  multiplierEnabled: z.boolean().default(false),
  multiplierBase: z.number().int().min(2).max(10).default(2),
  panicRaiderCount: z.number().int().min(0).max(100).default(0),
  panicWindowSeconds: z.number().int().min(5).max(600).default(30),
  lockdownMentionThreshold: z.number().int().min(0).max(10000).default(0),
  lockdownWindowSeconds: z.number().int().min(5).max(600).default(30),
  lockdownDurationMinutes: z.number().int().min(1).max(1440).default(10),
  terms: z.array(z.string(), {}).default([]),
  regexRules: z.array(z.string(), {}).default([]),
  blockInvites: z.boolean().default(false),
  inviteAllowlist: z.array(z.string(), {}).default([]),
  blockLinks: z.boolean().default(false),
  linkAllowlist: z.array(z.string(), {}).default([]),
  maxMentions: z.number().int().min(0).max(50).default(0),
  maxCapsPercent: z.number().int().min(0).max(100).default(0),
  capsMinLength: z.number().int().min(1).max(500).default(12),
  exemptRoles: z.array(z.string(), {}).default([]),
  filterTimeoutMinutes: z.number().int().min(0).max(40320).default(0),
  logChannelId: z.string().nullable().default(null),
}, {});

export default defineModule({
  name: "security-automod",
  displayName: "Automod",
  emoji: "🤖",
  description: "Heat-based automod with 13 filters, escalating punishments, and permit-based immunity",
  version: "2.0.0",
  config: AutomodConfigSchema,
  configFields: [],
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[security-automod] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[security-automod] Module unloaded");
  },
});