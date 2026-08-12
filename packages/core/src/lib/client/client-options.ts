import { parseRedisConnectionOption } from "#lib/database/redis.js";
import { buildRestOptions } from "#lib/discord-rest.js";
import { envParseInteger, envParseString, getServiceRole } from "#lib/env.js";
import { buildI18nOptions } from "#lib/i18n/index.js";
import { PinoSapphireLogger } from "#lib/logging/PinoSapphireLogger.js";
import { BotConfig } from "#lib/utilities/config.js";
import { buildSimpleThrottlerFactory } from "@lumi/sharding";
import { LogLevel } from "@sapphire/framework";
import {
  GatewayIntentBits,
  Options,
  Partials,
  Sweepers,
  type ClientOptions,
  type PresenceStatusData,
} from "discord.js";
import type { LumiClient } from "./LumiClient.js";

/**
 * Assembles the discord.js + Sapphire options the client is constructed with.
 *
 * @remarks
 *
 * Kept as a free function because it has to be evaluated inside the `super()`
 * argument list, before `this` exists. The sharding block is spread in only
 * when a plan is supplied - the scheduler role opens no gateway connection and
 * must not declare shards.
 *
 * @param options - Caller-supplied client options.
 */
export function buildClientOptions(options: LumiClient.Options): ClientOptions {
  return {
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 50,
      ReactionManager: 0,
      GuildMemberManager: 50,
      ThreadManager: 25,
      UserManager: 200,
      StageInstanceManager: 0,
      GuildScheduledEventManager: 0,
      AutoModerationRuleManager: 0,
      GuildBanManager: 0,
      GuildInviteManager: 0,
      GuildEmojiManager: 0,
      GuildStickerManager: 0,
      BaseGuildEmojiManager: 0,
      ApplicationCommandManager: 0,
      ApplicationEmojiManager: 0,
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 300, lifetime: 600 },
      users: {
        interval: 3600,
        filter: () => (user) => user.bot && user.id !== user.client.user.id,
      },
      threads: { interval: 3600, lifetime: 3600 },
      guildMembers: {
        interval: 1800,
        filter: Sweepers.filterByLifetime({
          lifetime: 1800,
          excludeFromSweep: (m) => m.id === m.client.user.id,
        }),
      },
    },
    ...(options.shardPlan && {
      shardCount: options.shardPlan.shardCount,
      ...(options.shardPlan.shards && { shards: [...options.shardPlan.shards] }),
      ws: {
        buildIdentifyThrottler: buildSimpleThrottlerFactory(options.shardPlan),
      },
    }),
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildWebhooks,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
    allowedMentions: { parse: ["users"], repliedUser: true },
    presence: {
      activities: [
        {
          name: BotConfig.presence.activityText,
          type: BotConfig.presence.activityType,
        },
      ],
      status: BotConfig.presence.status as PresenceStatusData,
    },
    loadMessageCommandListeners: true,
    loadDefaultErrorListeners: false,
    loadScheduledTaskErrorListeners: false,
    baseUserDirectory: new URL("../../", import.meta.url),
    defaultPrefix: envParseString("DEFAULT_PREFIX", ","),
    logger: {
      instance: new PinoSapphireLogger(
        envParseString("SERVICE_NAME", getServiceRole()),
        process.env["NODE_ENV"] === "development"
          ? LogLevel.Debug
          : LogLevel.Info,
      ),
    },
    hmr: {
      enabled: process.env["NODE_ENV"] === "development",
    },
    i18n: buildI18nOptions(),
    tasks: {
      bull: {
        connection: {
          ...parseRedisConnectionOption(),
          db: envParseInteger("REDIS_TASK_DB", 1),
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      },
    },
    rest: buildRestOptions(),
  };
}
