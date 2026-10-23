import { z } from "zod";

/**
 * Every field has a safe fallback. A malformed value stored from an old build
 * or a typo in a text setting must not make verification or panic unusable.
 */
export const securityConfigSchema = z.object({
  verification_enabled: z.boolean().default(false).catch(false),
  verified_role_id: z.string().nullable().default(null).catch(null),
  verification_pending_role_id: z.string().nullable().default(null).catch(null),
  verification_mode: z.enum(["emoji", "none"]).default("emoji").catch("emoji"),
  verification_target: z.enum(["everyone", "suspicious"]).default("everyone").catch("everyone"),
  verification_timeout_minutes: z.number().int().min(1).max(1_440).default(10).catch(10),
  verification_kick_on_timeout: z.boolean().default(false).catch(false),
  panic_lock_channel_ids: z.array(z.string()).default([]).catch([]),
});

export type SecurityConfig = z.infer<typeof securityConfigSchema>;
