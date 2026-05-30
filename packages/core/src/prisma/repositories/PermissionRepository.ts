import { RedisKeys, RedisTTL } from "#database/redis.js";
import { Repository } from "#root/prisma/repositories/Repository.js";

export interface CachedOverride {
  modelType: string;
  modelId: string;
  allow: boolean;
}

/**
 * Per-command, per-guild permission allow/deny overrides
 * (`PermissionOverride`), with the `permOverrides` Redis cache.
 */
export class PermissionRepository extends Repository {
  public async getPermissionOverrides(
    guildId: string,
    commandPath: string,
  ): Promise<CachedOverride[]> {
    if (!commandPath) return [];

    return this.getOrSet(
      RedisKeys.permOverrides(commandPath, guildId),
      RedisTTL.permOverrides,
      async () => {
        const rows = await this.prisma.permissionOverride.findMany({
          where: { guildId, commandPath },
        });
        return rows.map((r) => ({
          modelType: r.modelType,
          modelId: r.modelId,
          allow: r.allow,
        }));
      },
    );
  }

  public async clearPermissionOverrides(
    guildId: string,
    commandPath: string,
    type?: string | null,
    id?: string,
  ) {
    const where = {
      guildId,
      commandPath,
      ...(type && id ? { modelType: type, modelId: id } : {}),
    };
    const { count } = await this.prisma.permissionOverride.deleteMany({
      where,
    });
    await this.invalidate(RedisKeys.permOverrides(commandPath, guildId));
    return count;
  }

  public async setPermissionOverride(
    guildId: string,
    commandPath: string,
    type: string,
    id: string,
    allow: boolean,
  ) {
    await this.prisma.permissionOverride.upsert({
      where: {
        guildId_commandPath_modelType_modelId: {
          guildId,
          commandPath,
          modelType: type,
          modelId: id,
        },
      },
      update: { allow },
      create: { guildId, commandPath, modelType: type, modelId: id, allow },
    });
    await this.invalidate(RedisKeys.permOverrides(commandPath, guildId));
  }

  public getAllPermissionOverrides(guildId: string, commandPath?: string) {
    return this.prisma.permissionOverride.findMany({
      where: { guildId, commandPath: commandPath ?? undefined },
    });
  }
}
