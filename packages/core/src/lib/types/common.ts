import type { RedisClient } from "#lib/database/cluster-safe.js";
import type { DatabaseClient } from "#lib/prisma/client.js";
import type { ModuleStore } from "#lib/module-system/ModuleStore.js";
import type { InvalidationBus, SignalBus } from "#lib/database/redis.js";
import type { EventBus } from "#lib/event-bus/types.js";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";
import type { Message } from "discord.js";
import "@sapphire/pieces";

/** A Discord message that is guaranteed to be from a guild and from a non-bot user. */
export type GuildMessage = Message<true>;

/** Custom events emitted by the Lumi client, separate from discord.js built-ins. */
export const LumiEvents = {
  /** Fired for every guild message from a non-bot, non-webhook user. */
  GuildUserMessage: "lumiGuildUserMessage",
  /**
   * Fired when such a message is edited. Kept separate from GuildUserMessage so
   * consumers can re-screen the new content without rate-based counters
   * treating one message as several.
   */
  GuildUserMessageEdit: "lumiGuildUserMessageEdit",
} as const;

declare module "discord.js" {
  interface ClientEvents {
    lumiGuildUserMessage: [message: Message<true>];
    lumiGuildUserMessageEdit: [message: Message<true>];
  }
}

type DatabaseRepositories = DatabaseService;

export type { ScheduledTasks } from "@sapphire/plugin-scheduled-tasks";

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "flush-logs": Record<string, never>;
  }
}

/** Modules register per-key invalidation callbacks here instead of patching ConfigUtility. */
type ConfigChangeHook = (guildId: string, key: string) => Promise<void>;

/**
 * Guard run before a config value is persisted, for checks the schema cannot
 * express (e.g. proving a regex terminates). Return a reason to reject the
 * write, or null to accept it.
 */
type ConfigValueValidator = (
  value: unknown,
  guildId: string,
) => Promise<string | null> | string | null;

declare module "@sapphire/pieces" {
  interface Container {
    readonly prisma: DatabaseClient;
    readonly redis: RedisClient;
    readonly invalidation: InvalidationBus;
    readonly signals: SignalBus;
    readonly db: DatabaseRepositories;
    readonly eventBus: EventBus;
    readonly moduleStore: ModuleStore;
    readonly permitResolver: import("#lib/permissions/PermitResolver.js").PermitResolver;

    stats: {
      messages: number;
      identifies: number;
      resumes: number;
      lastIdentify: Date | null;
      lastResume: Date | null;
    };

    /** Key format: `"<moduleName>:<configKey>"` */
    readonly configChangeHooks: Map<string, ConfigChangeHook>;

    /** Pre-write value guards. Key format: `"<moduleName>:<configKey>"` */
    readonly configValueValidators: Map<string, ConfigValueValidator>;
  }
}


import "@sapphire/plugin-utilities-store";
