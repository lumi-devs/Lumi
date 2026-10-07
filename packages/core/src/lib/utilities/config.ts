import { join } from "node:path";
import { ActivityType } from "discord.js";
import { z } from "zod";
import { mergeDefault } from "@lumi/shared";
import { BrandColors } from '#lib/branding/colors.js';

const colorRecord = z.record(z.string(), z.number().int()).optional();

const userConfigSchema = z
  .object({
    presence: z
      .object({
        activityType: z.enum(ActivityType).optional(),
        activityText: z.string().optional(),
        status: z.enum(["online", "idle", "dnd", "invisible"]).optional(),
      })
      .optional(),
    branding: z
      .object({
        colors: colorRecord,
        links: z
          .object({
            supportServer: z.string().optional(),
            website: z.string().optional(),
            github: z.string().optional(),
          })
          .optional(),
      })
      .optional(),

    ui: z
      .object({
        defaultListPerPage: z.number().int().gt(0).optional(),
      })
      .optional(),
  })
  .strict();

const defaultConfig = {
  presence: {
    activityType: ActivityType.Watching,
    activityText: "the server",
    status: "online",
  },
  branding: {
    links: {
      supportServer: "",
      website: "",
      github: "",
    },
  },

  ui: {
    defaultListPerPage: 10,
  },
};

let userConfig: Record<string, unknown> = {};

try {
  const configPath = join(process.cwd(), "config", "bot.ts");
  const mod = await import(configPath);
  const raw: unknown = mod?.default ?? {};
  if (typeof raw === "object" && raw !== null) {
    userConfig = userConfigSchema.parse(raw);
  }
} catch (err: unknown) {
  const e = err as NodeJS.ErrnoException;
  if (e?.code !== "ERR_MODULE_NOT_FOUND" && e?.code !== "ENOENT") {
    console.error("[Config] Failed to load config/bot.ts:", err);
  }
}

type BotConfigType = typeof defaultConfig & {
  branding: typeof defaultConfig.branding & {
    colors?: Record<string, number>;
  };
};

export const BotConfig = mergeDefault(
  defaultConfig,
  userConfig,
) as BotConfigType;

export type CardColorKey = keyof typeof BrandColors;

/** Keys with no built-in accent bar unless the operator opts in via `config/bot.ts` - `BrandColors[key]` still names what that opt-in would use. */
const BlankByDefault: ReadonlySet<CardColorKey> = new Set(["primary"]);

/** Single resolution path for card colors - checks the operator's `config/bot.ts` override before falling back to the built-in palette. */
export function resolveCardColor(key: CardColorKey): number | undefined {
  const override = BotConfig.branding.colors?.[key];
  if (override !== undefined) return override;
  return BlankByDefault.has(key) ? undefined : BrandColors[key];
}
