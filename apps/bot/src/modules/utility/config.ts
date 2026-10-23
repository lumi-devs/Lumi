import { z } from "zod";

export const utilityConfigSchema = z.object({
  max_purge_limit: z.number().int().min(1).max(100).default(100),
  allow_self_nick: z.boolean().default(true),
});

export type UtilityConfig = z.infer<typeof utilityConfigSchema>;
