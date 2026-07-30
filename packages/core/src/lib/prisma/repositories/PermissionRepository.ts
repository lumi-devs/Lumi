import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { tryParseJSON } from "@sapphire/utilities";

export interface TargetPermitPayload {
  custom: string[];
  enforced: string[];
}

export interface UserPermitSet {
  customPermits: Set<string>;
  enforcedPermits: Set<string>;
  isQuarantined: boolean;
}

/**
 * Wick-style Permit repository managing custom and enforced permits
 * using target-level Redis caching and cache-aside invalidation.
 */
export class PermissionRepository extends Repository {
  /**
   * Fetches target permit payload for a single target (user or role) in a guild, with cache-aside.
   */
  public async getTargetPermits(
    guildId: string,
    targetType: "user" | "role",
    targetId: string,
  ): Promise<TargetPermitPayload> {
    const key = RedisKeys.targetPermits(guildId, targetType, targetId);
    return this.getOrSet(
      key,
      RedisTTL.permits,
      async () => {
        const [customRows, enforcedRows] = await Promise.all([
          this.prisma.customPermit.findMany({
            where: { guildId, targetType, targetId },
            select: { permit: true },
          }),
          this.prisma.enforcedPermit.findMany({
            where: { guildId, targetType, targetId },
            select: { permit: true },
          }),
        ]);
        return {
          custom: customRows.map((r) => r.permit),
          enforced: enforcedRows.map((r) => r.permit),
        };
      },
    );
  }

  /**
   * Evaluates all permits for a user and their assigned roles in a guild.
   * Uses Redis MGET for batched retrieval across user + role target keys.
   */
  public async getUserPermits(
    guildId: string,
    userId: string,
    roleIds: string[] = [],
  ): Promise<UserPermitSet> {
    const targets: Array<{ targetType: "user" | "role"; targetId: string }> = [
      { targetType: "user", targetId: userId },
      ...roleIds.map((targetId) => ({ targetType: "role" as const, targetId })),
    ];

    const keys = targets.map((t) =>
      RedisKeys.targetPermits(guildId, t.targetType, t.targetId),
    );

    // 1. Batch read from Redis via MGET
    const rawResults = await this.redis.mget(...keys);

    const customPermits = new Set<string>();
    const enforcedPermits = new Set<string>();

    const missingTargets: Array<{
      targetType: "user" | "role";
      targetId: string;
      key: string;
    }> = [];

    // 2. Parse hits and track misses
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]!;
      const raw = rawResults[i];
      if (raw) {
        const parsed = tryParseJSON(raw) as TargetPermitPayload | null;
        if (
          parsed &&
          Array.isArray(parsed.custom) &&
          Array.isArray(parsed.enforced)
        ) {
          for (const p of parsed.custom) customPermits.add(p);
          for (const p of parsed.enforced) enforcedPermits.add(p);
          continue;
        }
      }
      missingTargets.push({ ...target, key: keys[i]! });
    }

    // 3. Resolve missing targets from DB in a single roundtrip and backfill Redis
    if (missingTargets.length > 0) {
      const [customRows, enforcedRows] = await Promise.all([
        this.prisma.customPermit.findMany({
          where: {
            guildId,
            OR: missingTargets.map((m) => ({
              targetType: m.targetType,
              targetId: m.targetId,
            })),
          },
        }),
        this.prisma.enforcedPermit.findMany({
          where: {
            guildId,
            OR: missingTargets.map((m) => ({
              targetType: m.targetType,
              targetId: m.targetId,
            })),
          },
        }),
      ]);

      const pipeline = this.redis.pipeline();

      for (const missing of missingTargets) {
        const cPerms = customRows
          .filter(
            (r) =>
              r.targetType === missing.targetType &&
              r.targetId === missing.targetId,
          )
          .map((r) => r.permit);
        const ePerms = enforcedRows
          .filter(
            (r) =>
              r.targetType === missing.targetType &&
              r.targetId === missing.targetId,
          )
          .map((r) => r.permit);

        for (const p of cPerms) customPermits.add(p);
        for (const p of ePerms) enforcedPermits.add(p);

        const payload: TargetPermitPayload = {
          custom: cPerms,
          enforced: ePerms,
        };
        pipeline.setex(missing.key, RedisTTL.permits, JSON.stringify(payload));
      }

      await pipeline.exec();
    }

    // 4. Anti-Nuke Quarantine Interceptor check
    const isQuarantined = await this.isUserQuarantined(guildId, userId);

    return {
      customPermits: isQuarantined ? new Set<string>() : customPermits,
      enforcedPermits,
      isQuarantined,
    };
  }

  /** Checks if user is subject to Anti-Nuke Quarantine. */
  public async isUserQuarantined(
    guildId: string,
    userId: string,
  ): Promise<boolean> {
    const key = RedisKeys.quarantineState(guildId, userId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /** Grants custom permit and publishes invalidation via InvalidationBus. */
  public async grantCustomPermit(
    guildId: string,
    targetType: "user" | "role",
    targetId: string,
    permit: string,
  ): Promise<void> {
    await this.prisma.customPermit.upsert({
      where: {
        uq_custom_permit: { guildId, targetType, targetId, permit },
      },
      update: {},
      create: { guildId, targetType, targetId, permit },
    });
    await this.invalidate(
      RedisKeys.targetPermits(guildId, targetType, targetId),
    );
  }

  /** Revokes custom permit and publishes invalidation via InvalidationBus. */
  public async revokeCustomPermit(
    guildId: string,
    targetType: "user" | "role",
    targetId: string,
    permit: string,
  ): Promise<number> {
    const { count } = await this.prisma.customPermit.deleteMany({
      where: { guildId, targetType, targetId, permit },
    });
    await this.invalidate(
      RedisKeys.targetPermits(guildId, targetType, targetId),
    );
    return count;
  }

  /** Grants enforced permit and publishes invalidation via InvalidationBus. */
  public async grantEnforcedPermit(
    guildId: string,
    targetType: "user" | "role",
    targetId: string,
    permit: string,
  ): Promise<void> {
    await this.prisma.enforcedPermit.upsert({
      where: {
        uq_enforced_permit: { guildId, targetType, targetId, permit },
      },
      update: {},
      create: { guildId, targetType, targetId, permit },
    });
    await this.invalidate(
      RedisKeys.targetPermits(guildId, targetType, targetId),
    );
  }

  /** Revokes enforced permit and publishes invalidation via InvalidationBus. */
  public async revokeEnforcedPermit(
    guildId: string,
    targetType: "user" | "role",
    targetId: string,
    permit: string,
  ): Promise<number> {
    const { count } = await this.prisma.enforcedPermit.deleteMany({
      where: { guildId, targetType, targetId, permit },
    });
    await this.invalidate(
      RedisKeys.targetPermits(guildId, targetType, targetId),
    );
    return count;
  }

  /** Retrieves all permits configured for a guild. */
  public async getGuildPermits(guildId: string) {
    const [custom, enforced] = await Promise.all([
      this.prisma.customPermit.findMany({ where: { guildId } }),
      this.prisma.enforcedPermit.findMany({ where: { guildId } }),
    ]);
    return { custom, enforced };
  }
}
