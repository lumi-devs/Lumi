import { z } from "zod";
import { StatsConfigKey } from "./constants.js";

export const StatsConfigSchema = z.object({
  public: z.boolean().default(true),
  ignoredChannels: z.array(z.string()).default([]),
  ignoredRoles: z.array(z.string()).default([]),
});

export type StatsConfig = z.infer<typeof StatsConfigSchema>;

interface ConfigServices {
  config: {
    get(guildId: string, key: string): Promise<unknown>;
  };
}

export async function getStatsConfig(
  services: ConfigServices,
  guildId: string,
): Promise<StatsConfig> {
  const stored = await services.config.get(guildId, StatsConfigKey);
  const parsed = StatsConfigSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : StatsConfigSchema.parse({});
}

export function isIgnoredChannel(
  config: StatsConfig,
  channelId: string | null | undefined,
): boolean {
  return Boolean(channelId && config.ignoredChannels.includes(channelId));
}

export function isIgnoredMember(
  config: StatsConfig,
  member:
    | {
        roles?: { cache?: { keys(): IterableIterator<string> } };
        user?: { bot?: boolean };
      }
    | null
    | undefined,
): boolean {
  if (!member) return false;
  if (member.user?.bot) return true;
  const roles = member.roles?.cache;
  if (!roles) return false;
  for (const roleId of roles.keys()) {
    if (config.ignoredRoles.includes(roleId)) return true;
  }
  return false;
}
