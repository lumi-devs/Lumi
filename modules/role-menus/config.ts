import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const MaxTempDurationSeconds = 30 * 24 * 60 * 60;

export const RoleMenusConfigSchema = z.object({
  defaultMode: z.enum(["single", "multiple"]).default("multiple"),
  defaultRequireOne: z.boolean().default(false),
  defaultAutoToggle: z.boolean().default(true),
  defaultMaxSelections: z.number().int().min(0).max(25).default(0),
  defaultTempDurationSeconds: z
    .number()
    .int()
    .min(0)
    .max(MaxTempDurationSeconds)
    .default(0),
  maxOptionsPerGroup: z.number().int().min(1).max(25).default(25),
});

export type RoleMenusConfig = z.infer<typeof RoleMenusConfigSchema>;

export const RoleMenusConfigKey = "roleMenus";

export async function getRoleMenusConfig(
  services: ModuleServices,
  guildId: string,
): Promise<RoleMenusConfig> {
  const stored = await services.config.get(guildId, RoleMenusConfigKey);
  const parsed = RoleMenusConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "[role-menus] invalid configuration, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return RoleMenusConfigSchema.parse({});
}
