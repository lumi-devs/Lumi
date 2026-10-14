import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import { CacheKeys, CacheTTL } from "#src/lib/cache/Keys.js";
import type { Global } from "@prisma/client";

export interface UpdateGlobalInput {
  botName?: string;
  defaultPrefix?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  inviteUrl?: string | null;
  supportGuildId?: string | null;
  serverLockEnabled?: boolean;
  serverLockGuildIds?: string[];
  autoUpdateEnabled?: boolean;
  autoUpdateIntervalMinutes?: number;
  autoUpdateLastCheckedAt?: Date | null;
}

export class GlobalRepository extends Repository {

  public async getGlobalConfig(): Promise<Global> {
    const key = CacheKeys.globalConfig();
    return this.getOrSet(key, CacheTTL.globalConfig, async () => {
      let config = await this.prisma.global.findUnique({ where: { id: 1 } });
      if (!config) {
        config = await this.prisma.global.create({
          data: { id: 1 },
        });
      }
      return config;
    });
  }

  public async updateGlobalConfig(input: UpdateGlobalInput): Promise<Global> {
    const key = CacheKeys.globalConfig();
    const updated = await this.prisma.global.upsert({
      where: { id: 1 },
      create: { id: 1, ...input },
      update: input,
    });
    await this.invalidate(key);
    return updated;
  }

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
