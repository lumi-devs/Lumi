import {
  SapphireClient,
  LogLevel,
  container,
  ApplicationCommandRegistries,
  RegisterBehavior,
} from "@sapphire/framework";
import { GatewayIntentBits, Partials, type Message, Options } from "discord.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord-api-types/v10";
import { envParseString, envParseInteger } from "#lib/env.js";
import { prisma } from "#database/prisma.js";
import {
  createRedisClient,
  parseRedisConnectionOption,
  InvalidationBus,
  RedisKeys,
  RedisTTL,
} from "#database/redis.js";
import { RabbitClient } from "#lib/rabbit.js";
import { WorkerManager } from "#workers/WorkerManager.js";
import { ModuleStore } from "#core/module-system/ModuleStore.js";

import { DatabaseService } from "#root/prisma/DatabaseService.js";
import { ServiceStore } from "#core/module-system/ServiceStore.js";
import { BotConfig } from "#utilities/config.js";

export class EmberClient extends SapphireClient {
  public constructor() {
    super({
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 0,
        PresenceManager: 0,
        ReactionManager: 0,
        GuildMemberManager: 50,
      }),
      ws: {
        shardIds: process.env.SHARD_LIST
          ? process.env.SHARD_LIST.split(",").map(Number)
          : ("auto" as any),
        shardCount: process.env.TOTAL_SHARDS
          ? parseInt(process.env.TOTAL_SHARDS, 10)
          : undefined,
      },
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.GuildMember],
      allowedMentions: { parse: ["users"], repliedUser: true },
      presence: {
        activities: [
          {
            name: BotConfig.presence.activityText,
            type: BotConfig.presence.activityType,
          },
        ],
        status: BotConfig.presence.status as any,
      },
      loadMessageCommandListeners: true,
      loadDefaultErrorListeners: false,
      loadScheduledTaskErrorListeners: false,
      baseUserDirectory: new URL("../", import.meta.url),
      defaultPrefix: envParseString("DEFAULT_PREFIX", ","),
      fetchPrefix: (m) => this._fetchPrefix(m),
      logger: {
        level:
          envParseString("NODE_ENV", "development") === "production"
            ? LogLevel.Info
            : LogLevel.Debug,
      },
      i18n: {
        fetchLanguage: async (ctx) => {
          if (!ctx.guild) return "en-US";
          const settings = await container.db.getGuildSettings(ctx.guild.id);
          return settings.locale;
        },
        i18next: {
          debug: false,
        },
      },
      tasks: {
        bull: {
          connection: {
            ...parseRedisConnectionOption(),
            db: envParseInteger("REDIS_TASK_DB", 1),
          },
        },
      },
      api: {
        prefix: "/",
        origin: envParseString("API_ORIGIN", "http://localhost:4000"),
        listenOptions: {
          port: envParseInteger("API_PORT", 4000),
        },
      },
    });

    // 1. Module system setup
    const moduleStore = new ModuleStore();
    moduleStore.addRoot(new URL("../modules/", import.meta.url));
    this.stores.register(new ServiceStore());
    this.stores.register(moduleStore);
    this.stores.registerPath(new URL("../core/", import.meta.url));
    this.stores.registerPath(new URL("../core/permissions/", import.meta.url));
    this.stores
      .get("listeners")
      .registerPath(new URL("../core/sentry/", import.meta.url));

    // 2. Container injection
    Object.assign(container, {
      prisma,
      redis: createRedisClient(),
      invalidation: new InvalidationBus(createRedisClient()),
      db: new DatabaseService(prisma, createRedisClient(), container.logger),
      modules: Object.create(null),
      moduleStore,
      workers: new WorkerManager(),
      stats: {
        messages: 0,
        identifies: 0,
        resumes: 0,
        lastIdentify: null,
        lastResume: null,
      },
    });

    ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(
      RegisterBehavior.BulkOverwrite,
    );

    // Patch toJSON to ensure Discord-side synchronization
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalToJSON = SlashCommandBuilder.prototype.toJSON;
    SlashCommandBuilder.prototype.toJSON = function toJSON() {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const json = originalToJSON.call(this);

      // Discord defaults integration_types to [GuildInstall]
      json.integration_types ??= [ApplicationIntegrationType.GuildInstall];

      // We explicitly call setContexts and setDefaultMemberPermissions on the builder now,
      // so we only need to provide absolute defaults here if they are missing.
      json.contexts ??= [
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ];

      return json;
    };

    // 3. Stats tracking
    this.on("messageCreate", (m) => {
      if (!m.author.bot) container.stats.messages++;
    });
  }

  public override async login(token?: string) {
    await container.prisma.$connect();
    await container.invalidation.start();

    const rabbitUrl = envParseString("RABBITMQ_URL");
    container.rabbit = new RabbitClient(rabbitUrl);

    // 1. Wait for connection with a 15s timeout
    try {
      await Promise.race([
        container.rabbit.waitForConnect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("RabbitMQ connection timeout")),
            15_000,
          ),
        ),
      ]);
    } catch (err: unknown) {
      container.logger.error(
        "[RabbitMQ] Connection failed or timed out. Background tasks will be unavailable.",
        err,
      );
    }

    await this.stores.get("modules").discover();

    const result = await super.login(token);

    // 2. Start consumers if connected
    if (container.rabbit.connected) {
      container.rabbit.startConsumers();
    }

    return result;
  }

  public override async destroy() {
    await super.destroy();
    await container.workers.destroy();
    await container.rabbit?.close();
    await container.invalidation.stop();
    await container.redis
      .quit()
      .catch((err) =>
        container.logger.warn("[Client] Redis quit failed:", err),
      );
    await container.prisma
      .$disconnect()
      .catch((err) =>
        container.logger.warn("[Client] Prisma disconnect failed:", err),
      );
  }

  private async _fetchPrefix(message: Message) {
    if (!message.guild) return envParseString("DEFAULT_PREFIX", ",");

    const cacheKey = RedisKeys.guildPrefixes(message.guild.id);
    const cached = await container.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];

    const settings = await container.db.getGuildSettings(message.guild.id);
    const fallback = envParseString("DEFAULT_PREFIX", ",");
    const prefixes = settings.prefix ? [settings.prefix] : [fallback];

    await container.redis.setex(
      cacheKey,
      RedisTTL.guildPrefix,
      JSON.stringify(prefixes),
    );
    return prefixes;
  }
}
