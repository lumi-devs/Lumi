import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ActivityType } from "discord.js";

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

let userConfig = {};

try {
  const configPath = join(process.cwd(), "config", "bot.json");
  if (existsSync(configPath)) {
    const file = readFileSync(configPath, "utf-8");
    userConfig = JSON.parse(file);
  }
} catch (err) {
  console.error("[Config] Failed to load config/bot.json:", err);
}

function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === "object" && !Array.isArray(item);
}

function mergeDeep(target: any, source: any): any {
  if (isObject(target) && isObject(source)) {
    const output = Object.assign({}, target);
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (key in target) output[key] = mergeDeep(target[key], source[key]);
        else Object.assign(output, { [key]: source[key] });
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
    return output;
  }
  return source;
}

// Deep merge user config over the defaults
export const BotConfig = mergeDeep(
  defaultConfig,
  userConfig,
) as typeof defaultConfig;
