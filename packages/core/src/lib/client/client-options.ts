import { buildRestOptions } from "#lib/discord-rest.js";
import { envParseInteger } from "#lib/env.js";
import { BotConfig } from "#lib/utilities/config.js";
import {
  GatewayIntentBits,
  Options,
  Partials,
  Sweepers,
  type ClientOptions,
  type PresenceStatusData,
} from "discord.js";

export function buildClientOptions(): ClientOptions {
  return {
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
      PresenceManager: 0,
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
          name: BotConfig.presence.activityText,
          type: BotConfig.presence.activityType,
        },
      ],
      status: BotConfig.presence.status as PresenceStatusData,
    },
    rest: buildRestOptions(),
  };
}
