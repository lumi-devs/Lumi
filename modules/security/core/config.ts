import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const SecurityConfigSchema = z.object({
  logChannelId: z.string().nullable().default(null),
  quarantineRoleId: z.string().nullable().default(null),
  trustedRoleIds: z.array(z.string()).default([]),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

export const SecurityConfigKey = "security-core";

export async function getSecurityConfig(
  services: ModuleServices,
  guildId: string,
): Promise<SecurityConfig> {
  const stored = await services.moduleConfig.read(
    guildId,
    services.moduleName ?? SecurityConfigKey,
    SecurityConfigKey,
  );
  const parsed = SecurityConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "[security] invalid configuration, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return SecurityConfigSchema.parse({});
}
