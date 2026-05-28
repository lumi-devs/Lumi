import { promises as fs } from "node:fs";
import { join } from "node:path";
import { ActivityType } from "discord.js";
import { z } from "zod";

const colorRecord = z.record(z.string(), z.number().int()).optional();

const userConfigSchema = z
  .object({
    presence: z
      .object({
        activityType: z.nativeEnum(ActivityType).optional(),
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
    permissions: z
      .object({
        names: z
          .object({
            USER: z.string().optional(),
            MOD: z.string().optional(),
            ADMIN: z.string().optional(),
            GUILD_OWNER: z.string().optional(),
            BOT_OWNER: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    ui: z
      .object({
        defaultListPerPage: z.number().int().positive().optional(),
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
      PRIMARY: 0x5865f2,
      SUCCESS: 0x57f287,
      ERROR: 0xed4245,
      WARNING: 0xfee75c,
      INFO: 0x5865f2,
      NEUTRAL: 0x4f545c,
      GOLD: 0xffc800,
      // Aesthetic Palette
      SAKURA: 0xffb7c5,
      LEMON: 0xfff44f,
      ROSE: 0xf43f5e,
      AMBER: 0xf59e0b,
      PEACH: 0xfba190,
      LAVENDER: 0xa78bfa,
      MINT: 0x34d399,
    },
    links: {
      supportServer: "",
      website: "",
      github: "",
    },
  },
  permissions: {
    names: {
      USER: "User",
      MOD: "Moderator",
      ADMIN: "Administrator",
      GUILD_OWNER: "Server Owner",
      BOT_OWNER: "Bot Owner",
    },
  },
  ui: {
    defaultListPerPage: 10,
  },
};

let userConfig: z.infer<typeof userConfigSchema> = {};

try {
  const configPath = join(process.cwd(), "config", "bot.json");
  const file = await fs.readFile(configPath, "utf-8");
  const parsed = JSON.parse(file) as unknown;
  userConfig = userConfigSchema.parse(parsed);
} catch (err: unknown) {
  if (err instanceof z.ZodError) {
    console.error("[Config] Invalid config/bot.json:", err.flatten());
  } else if (
    err instanceof Error &&
    (err as NodeJS.ErrnoException).code !== "ENOENT"
  ) {
    console.error("[Config] Failed to load config/bot.json:", err);
  }
}

function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === "object" && !Array.isArray(item);
}

function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (isObject(source[key])) {
      if (key in target) {
        output[key] = mergeDeep(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>,
        );
      } else {
        output[key] = source[key];
      }
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

// Deep merge user config over the defaults
export const BotConfig = mergeDeep(
  defaultConfig,
  userConfig,
) as typeof defaultConfig;
