import type { RESTOptions } from "@discordjs/rest";
import { envParseInteger, getDiscordProxyUrl } from "#src/lib/Env.js";
import {
  ActivityType,
  GatewayIntentBits,
  Options,
  Partials,
  Sweepers,
  type ClientOptions,
} from "discord.js";

export interface BuildRestOptions {

  enableProxy?: boolean;

  proxyUrl?: string | null;
}

export function buildRestOptions(
  opts: BuildRestOptions = {},
): Partial<RESTOptions> {
  const enableProxy = opts.enableProxy ?? true;
  const proxyUrl =
    opts.proxyUrl === undefined ? getDiscordProxyUrl() : opts.proxyUrl;

  const base: Partial<RESTOptions> = {
    invalidRequestWarningInterval: 500,
    timeout: envParseInteger("DISCORD_REST_TIMEOUT_MS", 15_000),
    retries: envParseInteger("DISCORD_REST_RETRIES", 3),
  };

  if (!enableProxy || !proxyUrl) return base;

  const cleanUrl = proxyUrl.replace(/\/api(\/v\d+)?\/?$/, "").replace(/\/+$/, "");

  return {
    ...base,
    api: `${cleanUrl}/api`,
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
  };
}

export function buildClientOptions(): ClientOptions {
  return {
    shards: "auto",
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: envParseInteger("CACHE_MESSAGE_LIMIT", 50),
      ReactionManager: 0,
      GuildMemberManager: envParseInteger("CACHE_MEMBER_LIMIT", 50),
      ThreadManager: envParseInteger("CACHE_THREAD_LIMIT", 25),
      UserManager: envParseInteger("CACHE_USER_LIMIT", 200),
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
      PresenceManager: envParseInteger("CACHE_PRESENCE_LIMIT", 200),
      VoiceStateManager: 0,
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: {
        interval: envParseInteger("SWEEPER_MESSAGES_INTERVAL", 300),
        lifetime: envParseInteger("SWEEPER_MESSAGES_LIFETIME", 600),
      },
      users: {
        interval: 3600,
        filter: () => (user) => user.bot && user.id !== user.client.user.id,
      },
      threads: { interval: 3600, lifetime: 3600 },
      presences: { interval: 3600, filter: () => () => true },
      guildMembers: {
        interval: envParseInteger("SWEEPER_MEMBERS_INTERVAL", 1800),
        filter: Sweepers.filterByLifetime({
          lifetime: envParseInteger("SWEEPER_MEMBERS_LIFETIME", 1800),
          excludeFromSweep: (m) => m.id === m.client.user.id,
        }),
      },
    },
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
    allowedMentions: { parse: ["users"], repliedUser: true },
    presence: {
      activities: [
        {
          name: "the server",
          type: ActivityType.Watching,
        },
      ],
      status: "online",
    },
    rest: buildRestOptions(),
  };
}
