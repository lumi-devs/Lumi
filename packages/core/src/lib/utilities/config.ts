import { join } from "node:path";
import { ActivityType } from "discord.js";
import { s } from "@sapphire/shapeshift";
import { mergeDefault } from "@sapphire/utilities";
import { BrandColors } from '#lib/branding/colors.js';

const colorRecord = s.record(s.number().int()).optional();

const userConfigSchema = s
  .object({
    presence: s
      .object({
        activityType: s.nativeEnum(ActivityType).optional(),
        activityText: s.string().optional(),
        status: s.enum(["online", "idle", "dnd", "invisible"]).optional(),
      })
      .optional(),
    branding: s
      .object({
        colors: colorRecord,
        links: s
          .object({
            supportServer: s.string().optional(),
            website: s.string().optional(),
            github: s.string().optional(),
          })
          .optional(),
      })
      .optional(),

    ui: s
      .object({
        defaultListPerPage: s.number().int().greaterThan(0).optional(),
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

/** Built-in card palette, sourced from the Lumi brand system.
 * Operators can override individual colours via `config/bot.ts` → `branding.colors`. */
export const defaultCardColors = BrandColors;

export type CardColorKey = keyof typeof defaultCardColors;

/** Keys with no built-in accent bar unless the operator opts in via `config/bot.ts` - `defaultCardColors[key]` still names what that opt-in would use. */
const BLANK_BY_DEFAULT: ReadonlySet<CardColorKey> = new Set(["primary"]);

/** Single resolution path for card colors - checks the operator's `config/bot.ts` override before falling back to the built-in palette. */
export function resolveCardColor(key: CardColorKey): number | undefined {
  const override = BotConfig.branding.colors?.[key];
  if (override !== undefined) return override;
  return BLANK_BY_DEFAULT.has(key) ? undefined : defaultCardColors[key];
}
