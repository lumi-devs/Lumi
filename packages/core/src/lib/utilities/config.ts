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
    permissions: s
      .object({
        names: s
          .object({
            USER: s.string().optional(),
            MOD: s.string().optional(),
            ADMIN: s.string().optional(),
            GUILD_OWNER: s.string().optional(),
            BOT_OWNER: s.string().optional(),
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
      PRIMARY: 0x5865f2,
      SUCCESS: 0x57f287,
      ERROR: 0xed4245,
      WARNING: 0xfee75c,
      INFO: 0x5865f2,
      NEUTRAL: 0x4f545c,
      GOLD: 0xffc800,
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

let userConfig: Record<string, any> = {};

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
