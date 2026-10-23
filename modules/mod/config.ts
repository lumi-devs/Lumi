import { z } from "zod";

/**
 * Safe fallbacks keep moderation usable if a text setting was stored with an
 * unexpected shape. The panel validates what it can; Zod remains the boundary.
 */
export const modConfigSchema = z.object({
  log_channel_id: z.string().nullable().default(null).catch(null),
  dm_on_punish: z.boolean().default(true).catch(true),
  quarantine_role_id: z.string().nullable().default(null).catch(null),
  warn_thresholds: z.string().default("{}").catch("{}"),
  immune_role_ids: z.array(z.string()).default([]).catch([]),
});

export type ModConfig = z.infer<typeof modConfigSchema>;
