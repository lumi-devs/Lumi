import { z } from "zod";
import {
  QuoteAvatarSources,
  QuoteConfigKey,
  QuoteDefaultWatermark,
  QuoteModuleName,
  QuoteNameSources,
  QuoteThemes,
} from "./constants.js";

export const QuoteConfigSchema = z.object({
  channelId: z.string().nullable().default(null),
  theme: z.enum(QuoteThemes).default("dark"),
  watermark: z.string().max(64).default(QuoteDefaultWatermark),
  nameSource: z.enum(QuoteNameSources).default("nickname"),
  avatarSource: z.enum(QuoteAvatarSources).default("guild"),
  stripMarkdown: z.boolean().default(false),
  resolveMentions: z.boolean().default(true),
});

export type QuoteConfig = z.infer<typeof QuoteConfigSchema>;

interface ConfigServices {
  config: {
    get(guildId: string, key: string): Promise<unknown>;
  };
  observability?: {
    logger?: {
      warn?: (message: string, meta?: unknown) => void;
    };
  };
}

export async function getQuoteConfig(
  services: ConfigServices,
  guildId: string,
): Promise<QuoteConfig> {
  const stored = await services.config.get(guildId, QuoteConfigKey);
  const parsed = QuoteConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "[quote] invalid configuration, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return QuoteConfigSchema.parse({});
}

export function isQuoteModuleEnabled(
  services: {
    modules: { isEnabled: (guildId: string, moduleName: string) => boolean };
  },
  guildId: string,
): boolean {
  return services.modules.isEnabled(guildId, QuoteModuleName);
}
