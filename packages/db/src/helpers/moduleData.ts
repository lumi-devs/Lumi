import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

export interface ModuleDataEntry<T = unknown> {
  guildId: string;
  moduleName: string;
  targetId: string;
  key: string;
  value: T;
  expiresAt: Date | null;
}

export interface ModuleDataQuery {
  guildId?: string;
  moduleName: string;
  targetId?: string;
  key?: string;
  prefix?: string;
  limit?: number;
}

export interface ModuleDataSetOptions {
  ttlMs?: number;
}

const DefaultLimit = 1_000;
const MaxLimit = 5_000;
const CacheTtlMs = 60_000;
const NegativeTtlMs = 10_000;

function cacheKey(
  guildId: string,
  moduleName: string,
  targetId: string,
  version: number,
  key: string,
): string {
  return `module-data:${guildId}:${moduleName}:${targetId.length}:${targetId}:${version}:${key.length}:${key}`;
}

function versionKey(
  guildId: string,
  moduleName: string,
  targetId: string,
): string {
  return `module-data-version:${guildId}:${moduleName}:${targetId.length}:${targetId}`;
}

function cacheTtl(expiresAt: Date | null): number {
  if (!expiresAt) return CacheTtlMs;
  return Math.max(1, Math.min(CacheTtlMs, expiresAt.getTime() - Date.now()));
}

export function createModuleDataHelpers(ctx: DbContext) {
  const { prisma, cache } = ctx;

  async function readRow(
    guildId: string,
    moduleName: string,
    targetId: string,
    key: string,
  ): Promise<{ value: unknown; expiresAt: Date | null } | null> {
    return prisma.moduleData.findUnique({
      where: {
        guildId_moduleName_targetId_key: {
          guildId,
          moduleName,
          targetId,
          key,
        },
      },
      select: { value: true, expiresAt: true },
    });
  }

  async function readVersion(
    guildId: string,
    moduleName: string,
    targetId: string,
  ): Promise<number> {
    try {
      const raw = await cache.getString(
        versionKey(guildId, moduleName, targetId),
      );
      if (raw === null) return 0;
      const parsed = Number(raw);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  async function bumpVersion(
    guildId: string,
    moduleName: string,
    targetId: string,
  ): Promise<void> {
    try {
      await cache.incr(versionKey(guildId, moduleName, targetId));
    } catch {
      return;
    }
  }

  async function dropCache(
    guildId: string,
    moduleName: string,
    targetId: string,
    keys: readonly string[],
  ): Promise<void> {
    if (keys.length === 0) return;
    try {
      const version = await readVersion(guildId, moduleName, targetId);
      await Promise.all(
        keys.map((key) =>
          cache.del(cacheKey(guildId, moduleName, targetId, version, key)),
        ),
      );
    } catch {
      await bumpVersion(guildId, moduleName, targetId);
    }
  }

  async function targetsForUser(
    moduleName: string,
    userId: string,
  ): Promise<Array<{ guildId: string; targetId: string }>> {
    const rows = await prisma.moduleData.findMany({
      where: { moduleName, targetId: userId },
      select: { guildId: true, targetId: true },
      distinct: ["guildId", "targetId"],
    });
    return rows;
  }

  return {
    async get<T>(
      guildId: string,
      moduleName: string,
      targetId: string,
      key: string,
    ): Promise<T | null> {
      const version = await readVersion(guildId, moduleName, targetId);
      const cachedKey = cacheKey(guildId, moduleName, targetId, version, key);
      try {
        const cached = await cache.get<{ hit: boolean; value?: T }>(cachedKey);
        if (cached) return cached.hit ? (cached.value ?? null) : null;
      } catch {
        const fallback = await readRow(guildId, moduleName, targetId, key);
        if (!fallback) return null;
        if (
          fallback.expiresAt !== null &&
          fallback.expiresAt.getTime() <= Date.now()
        ) {
          return null;
        }
        return fallback.value as T;
      }

      const row = await readRow(guildId, moduleName, targetId, key);
      if (
        !row ||
        (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now())
      ) {
        try {
          await cache.set(
            cachedKey,
            { hit: false },
            row ? 1 : NegativeTtlMs,
          );
        } catch {
          return null;
        }
        if (row) {
          await prisma.moduleData
            .delete({
              where: {
                guildId_moduleName_targetId_key: {
                  guildId,
                  moduleName,
                  targetId,
                  key,
                },
              },
            })
            .catch(() => undefined);
        }
        return null;
      }
      const value = row.value as T;
      try {
        await cache.set(
          cachedKey,
          { hit: true, value },
          cacheTtl(row.expiresAt),
        );
      } catch {
        return value;
      }
      return value;
    },

    async set<T>(
      guildId: string,
      moduleName: string,
      targetId: string,
      key: string,
      value: T,
      options: ModuleDataSetOptions = {},
    ): Promise<void> {
      const expiresAt =
        options.ttlMs === undefined
          ? null
          : new Date(Date.now() + Math.max(1, options.ttlMs));
      await prisma.moduleData.upsert({
        where: {
          guildId_moduleName_targetId_key: {
            guildId,
            moduleName,
            targetId,
            key,
          },
        },
        update: { value: value as Prisma.InputJsonValue, expiresAt },
        create: {
          id: randomUUID(),
          guildId,
          moduleName,
          targetId,
          key,
          value: value as Prisma.InputJsonValue,
          expiresAt,
        },
      });
      const version = await readVersion(guildId, moduleName, targetId);
      try {
        await cache.set(
          cacheKey(guildId, moduleName, targetId, version, key),
          { hit: true, value },
          cacheTtl(expiresAt),
        );
      } catch {
        return;
      }
    },

    async take<T>(
      guildId: string,
      moduleName: string,
      targetId: string,
      key: string,
    ): Promise<T | null> {
      const rows = await prisma.$queryRaw<
        Array<{ value: unknown; expiresAt: Date | null }>
      >`
        DELETE FROM module_data
        WHERE guild_id = ${guildId}
          AND module_name = ${moduleName}
          AND target_id = ${targetId}
          AND key = ${key}
        RETURNING value, expires_at AS "expiresAt"
      `;
      const row = rows[0];
      if (!row) {
        await dropCache(guildId, moduleName, targetId, [key]);
        return null;
      }
      await dropCache(guildId, moduleName, targetId, [key]);
      if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
        return null;
      }
      return row.value as T;
    },

    async delete(
      guildId: string,
      moduleName: string,
      targetId: string,
      key: string,
    ): Promise<number> {
      const result = await prisma.moduleData.deleteMany({
        where: { guildId, moduleName, targetId, key },
      });
      await dropCache(guildId, moduleName, targetId, [key]);
      return result.count;
    },

    async deleteTarget(
      guildId: string,
      moduleName: string,
      targetId: string,
    ): Promise<number> {
      const keys = await prisma.moduleData.findMany({
        where: { guildId, moduleName, targetId },
        select: { key: true },
      });
      const result = await prisma.moduleData.deleteMany({
        where: { guildId, moduleName, targetId },
      });
      await dropCache(
        guildId,
        moduleName,
        targetId,
        keys.map((entry) => entry.key),
      );
      await bumpVersion(guildId, moduleName, targetId);
      return result.count;
    },

    async deleteModule(guildId: string, moduleName: string): Promise<number> {
      const targets = await prisma.moduleData.findMany({
        where: { guildId, moduleName },
        select: { targetId: true },
        distinct: ["targetId"],
      });
      const result = await prisma.moduleData.deleteMany({
        where: { guildId, moduleName },
      });
      await Promise.all(
        targets.map((target) =>
          bumpVersion(guildId, moduleName, target.targetId),
        ),
      );
      return result.count;
    },

    async deleteForUser(moduleName: string, userId: string): Promise<number> {
      const targets = await targetsForUser(moduleName, userId);
      const result = await prisma.moduleData.deleteMany({
        where: { moduleName, targetId: userId },
      });
      await Promise.all(
        targets.map((target) =>
          bumpVersion(target.guildId, moduleName, target.targetId),
        ),
      );
      return result.count;
    },

    async list<T>(query: ModuleDataQuery): Promise<Array<ModuleDataEntry<T>>> {
      const now = new Date();
      const keyFilter =
        query.prefix !== undefined
          ? { startsWith: query.prefix }
          : query.key !== undefined
            ? query.key
            : undefined;
      const rows = await prisma.moduleData.findMany({
        where: {
          ...(query.guildId !== undefined ? { guildId: query.guildId } : {}),
          moduleName: query.moduleName,
          ...(query.targetId !== undefined
            ? { targetId: query.targetId }
            : {}),
          ...(keyFilter !== undefined ? { key: keyFilter } : {}),
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ guildId: "asc" }, { targetId: "asc" }, { key: "asc" }],
        take:
          query.limit === undefined || !Number.isFinite(query.limit)
            ? DefaultLimit
            : Math.max(1, Math.min(MaxLimit, Math.trunc(query.limit))),
        select: {
          guildId: true,
          moduleName: true,
          targetId: true,
          key: true,
          value: true,
          expiresAt: true,
        },
      });
      return rows.map((row) => ({
        guildId: row.guildId,
        moduleName: row.moduleName,
        targetId: row.targetId,
        key: row.key,
        value: row.value as T,
        expiresAt: row.expiresAt,
      }));
    },

    async incr(
      guildId: string,
      moduleName: string,
      targetId: string,
      key: string,
      delta = 1,
    ): Promise<number> {
      const step = Math.trunc(delta);
      const rows = await prisma.$queryRaw<Array<{ value: bigint }>>`
        INSERT INTO module_data (
          id, guild_id, module_name, target_id, key, value, created_at, updated_at
        )
        VALUES (
          ${randomUUID()}, ${guildId}, ${moduleName}, ${targetId}, ${key},
          to_jsonb(${step}::bigint), NOW(), NOW()
        )
        ON CONFLICT (guild_id, module_name, target_id, key) DO UPDATE
        SET value = to_jsonb(
          COALESCE(NULLIF(module_data.value #>> '{}', '')::bigint, 0) + ${step}::bigint
        ),
        updated_at = NOW()
        RETURNING (value #>> '{}')::bigint AS value
      `;
      await dropCache(guildId, moduleName, targetId, [key]);
      return Number(rows[0]?.value ?? 0);
    },

    async count(
      guildId: string,
      moduleName: string,
      targetId?: string,
    ): Promise<number> {
      return prisma.moduleData.count({
        where: {
          guildId,
          moduleName,
          ...(targetId !== undefined ? { targetId } : {}),
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
    },
  };
}
