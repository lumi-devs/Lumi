import { Repository } from "./Repository.js";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import type { Global, Prisma } from "@prisma/client";

export interface UpdateGlobalInput {
  botName?: string;
  defaultPrefix?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  inviteUrl?: string | null;
  supportGuildId?: string | null;
  extra?: Prisma.InputJsonValue;
}

export class GlobalRepository extends Repository {
  /** Get global bot configuration (id = 1), using cache-aside with fallback creation. */
  public async getGlobalConfig(): Promise<Global> {
    const key = RedisKeys.globalConfig();
    return this.getOrSet(key, RedisTTL.globalConfig, async () => {
      let config = await this.prisma.global.findUnique({ where: { id: 1 } });
      if (!config) {
        config = await this.prisma.global.create({
          data: { id: 1 },
        });
      }
      return config;
    });
  }

  /** Update global bot configuration and invalidate cache. */
  public async updateGlobalConfig(input: UpdateGlobalInput): Promise<Global> {
    const key = RedisKeys.globalConfig();
    const updated = await this.prisma.global.upsert({
      where: { id: 1 },
      create: { id: 1, ...input },
      update: input,
    });
    await this.invalidate(key);
    return updated;
  }

  /** Set maintenance mode status and optional message. */
  public async setMaintenanceMode(
    enabled: boolean,
    message?: string | null,
  ): Promise<Global> {
    return this.updateGlobalConfig({
      maintenanceMode: enabled,
      ...(message !== undefined && { maintenanceMessage: message }),
    });
  }
}
