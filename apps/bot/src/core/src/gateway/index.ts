import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { Redis } from "ioredis";

export interface CoreServices {
  client: Client;
  redis: Redis;
}

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildScheduledEvents,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
      Partials.GuildMember,
      Partials.User,
      Partials.GuildScheduledEvent,
    ],
  });
}

export interface ShardManagerOptions {
  totalShards?: number;
  shardIds?: number[];
}

export class ShardManager {
  private client: Client;
  private readonly totalShards: number;
  private readonly shardIds: number[];

  constructor(client: Client, options: ShardManagerOptions = {}) {
    this.client = client;
    this.totalShards = options.totalShards ?? 0; // 0 = auto
    this.shardIds = options.shardIds ?? [];
  }

  async start(token: string): Promise<void> {
    await this.client.login(token);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  getClient(): Client {
    return this.client;
  }
}

export function createCoreServices(
  client: Client,
  redis: Redis
): CoreServices {
  return { client, redis };
}