import { join } from "node:path";
import { ActivityType } from "discord.js";
import { s } from "@sapphire/shapeshift";
import { mergeDefault } from "@sapphire/utilities";

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
    colors: {
      PRIMARY: 0,
      SUCCESS: 0,
      ERROR: 0,
      WARNING: 0,
      INFO: 0,
      NEUTRAL: 0,
      GOLD: 0,
    },
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

export const BotConfig = mergeDefault(
  defaultConfig,
  userConfig,
) as typeof defaultConfig;
